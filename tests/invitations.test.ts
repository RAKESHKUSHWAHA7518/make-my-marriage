import "../scripts/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { handleWedding } from "../src/modules/weddings/http";
import {
  getDatabase,
  closeDatabase,
} from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateMembershipInvites } from "../src/infrastructure/mongodb/migrations/003-membership-invites";
import { createWedding } from "../src/modules/weddings/service";
import {
  inviteFamily,
  revokeFamilyInvitation,
  inspectInvitation,
  acceptInvitation,
} from "../src/modules/weddings/invitations";
import { decrypt, type Encrypted } from "../src/modules/identity/security";
import { sendAccountEmails } from "../src/infrastructure/resend/account-mail";
import type { User } from "../src/modules/identity/service";

test("family invitation lifecycle in an isolated database, with no live email", async (t) => {
  const name = `mmm_invite_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name;
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.ACCOUNT_EMAIL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.RESEND_API_KEY = "test-never-sent";
  process.env.RESEND_FROM_EMAIL = "test@example.test";
  const db = await getDatabase();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls++;
    return Response.json({ id: `mock-${providerCalls}` });
  };
  async function user(verified = true) {
    const now = new Date();
    const email = `${randomBytes(8).toString("hex")}@example.test`;
    const row: User = {
      _id: new ObjectId(),
      email,
      emailNormalized: email,
      displayName: "Invitation QA",
      passwordHash: "unused",
      status: "active",
      credentialVersion: 1,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      ...(verified ? { emailVerifiedAt: now } : {}),
    };
    await db.collection<User>("users").insertOne(row);
    return row;
  }
  async function tokenFor(id: string) {
    const delivery = await db
      .collection("deliveries")
      .findOne({ membershipInviteId: new ObjectId(id) });
    const payload = JSON.parse(
      decrypt(delivery!.payloadEncrypted as Encrypted),
    );
    return /#token=([A-Za-z0-9_-]{43})/.exec(payload.text)![1]!;
  }
  try {
    await migrateAccounts(db);
    await migrateWeddings(db);
    await migrateMembershipInvites(db);
    const owner = await user();
    const wedding = await createWedding(
      owner,
      {
        couple: { brideName: "QA Bride", groomName: "QA Groom" },
        title: "QA Wedding",
        timezone: "Asia/Kolkata",
        currency: "INR",
      },
      "invite-lifecycle-key-12345",
    );
    await t.test(
      "atomic queue, duplicates, normalization and explicit matching-email acceptance",
      async () => {
        const recipient = await user();
        const invite = await inviteFamily(owner, wedding.id, {
          email: ` ${recipient.email.toUpperCase()} `,
          role: "MANAGER",
        });
        assert.equal(invite!.email, recipient.email);
        assert.equal(invite!.emailSubmission, "queued");
        assert.equal(
          await db
            .collection("memberships")
            .countDocuments({ userId: recipient._id }),
          0,
        );
        await assert.rejects(
          inviteFamily(owner, wedding.id, {
            email: recipient.email,
            role: "ADMIN",
          }),
          { code: "INVITATION_ALREADY_PENDING" },
        );
        const token = await tokenFor(invite!.id);
        assert.doesNotMatch(JSON.stringify(invite), new RegExp(token));
        await assert.rejects(inspectInvitation(owner, { token }), {
          code: "INVITATION_EMAIL_MISMATCH",
        });
        assert.equal(
          (await inspectInvitation(recipient, { token })).role,
          "MANAGER",
        );
        assert.equal(
          await db
            .collection("memberships")
            .countDocuments({ userId: recipient._id }),
          0,
        );
        const results = await Promise.all([
          acceptInvitation(recipient, { token }),
          acceptInvitation(recipient, { token }),
        ]);
        assert.equal(results[0]!.weddingId, wedding.id);
        assert.equal(results[1]!.role, "MANAGER");
        assert.equal(
          await db
            .collection("memberships")
            .countDocuments({ userId: recipient._id }),
          1,
        );
        await assert.rejects(
          inviteFamily(recipient, wedding.id, {
            email: "other@example.test",
            role: "ADMIN",
          }),
          { code: "FORBIDDEN" },
        );
        await assert.rejects(
          inviteFamily(owner, wedding.id, {
            email: recipient.email,
            role: "ADMIN",
          }),
          { code: "ALREADY_MEMBER" },
        );
      },
    );
    await t.test(
      "revoke is versioned, denies acceptance and cancels queued delivery",
      async () => {
        const recipient = await user();
        const invite = (await inviteFamily(owner, wedding.id, {
          email: recipient.email,
          role: "ADMIN",
        }))!;
        const token = await tokenFor(invite.id);
        await assert.rejects(
          revokeFamilyInvitation(owner, wedding.id, invite.id, {
            expectedVersion: 2,
          }),
          { code: "VERSION_CONFLICT" },
        );
        await revokeFamilyInvitation(owner, wedding.id, invite.id, {
          expectedVersion: 1,
        });
        await assert.rejects(acceptInvitation(recipient, { token }), {
          code: "INVITATION_UNAVAILABLE",
        });
        const delivery = await db
          .collection("deliveries")
          .findOne({ membershipInviteId: new ObjectId(invite.id) });
        assert.equal(delivery!.submissionState, "suppressed");
        assert.equal(delivery!.payloadEncrypted, undefined);
      },
    );
    await t.test(
      "expiration is settled before replacement; removed users can rejoin only their wedding",
      async () => {
        const recipient = await user();
        const invite = (await inviteFamily(owner, wedding.id, {
          email: recipient.email,
          role: "ADMIN",
        }))!;
        const token = await tokenFor(invite.id);
        await db
          .collection("membershipInvites")
          .updateOne(
            { _id: new ObjectId(invite.id) },
            { $set: { expiresAt: new Date(0) } },
          );
        await assert.rejects(acceptInvitation(recipient, { token }), {
          code: "INVITATION_EXPIRED",
        });
        const replacement = (await inviteFamily(owner, wedding.id, {
          email: recipient.email,
          role: "ADMIN",
        }))!;
        assert.notEqual(replacement.id, invite.id);
        const newToken = await tokenFor(replacement.id);
        await acceptInvitation(recipient, { token: newToken });
        await db
          .collection("memberships")
          .updateOne(
            { userId: recipient._id },
            { $set: { status: "removed" } },
          );
        await assert.rejects(acceptInvitation(recipient, { token: newToken }), {
          code: "INVITATION_UNAVAILABLE",
        });
        const fresh = (await inviteFamily(owner, wedding.id, {
          email: recipient.email,
          role: "MANAGER",
        }))!;
        await acceptInvitation(recipient, { token: await tokenFor(fresh.id) });
        assert.equal(
          (await db
            .collection("memberships")
            .findOne({ userId: recipient._id }))!.role,
          "MANAGER",
        );
      },
    );
    await t.test(
      "single-wedding rule, verification and archive restrictions",
      async () => {
        const unverified = await user(false);
        const invite = (await inviteFamily(owner, wedding.id, {
          email: unverified.email,
          role: "MANAGER",
        }))!;
        await assert.rejects(
          acceptInvitation(unverified, { token: await tokenFor(invite.id) }),
          { code: "EMAIL_NOT_VERIFIED" },
        );
        const other = await user();
        await createWedding(
          other,
          {
            couple: { brideName: "Other", groomName: "Couple" },
            title: "Other wedding",
            timezone: "UTC",
            currency: "INR",
          },
          "other-wedding-key-123456",
        );
        const second = (await inviteFamily(owner, wedding.id, {
          email: other.email,
          role: "MANAGER",
        }))!;
        await assert.rejects(
          acceptInvitation(other, { token: await tokenFor(second.id) }),
          { code: "WEDDING_ALREADY_EXISTS" },
        );
        await db
          .collection("weddings")
          .updateOne(
            { _id: new ObjectId(wedding.id) },
            { $set: { state: "archived" } },
          );
        await assert.rejects(
          inviteFamily(owner, wedding.id, {
            email: "new@example.test",
            role: "ADMIN",
          }),
          { code: "WEDDING_ARCHIVED" },
        );
        await revokeFamilyInvitation(owner, wedding.id, second.id, {
          expectedVersion: 1,
        });
        await assert.rejects(
          acceptInvitation(unverified, { token: await tokenFor(invite.id) }),
          { code: "WEDDING_ARCHIVED" },
        );
        await db
          .collection("weddings")
          .updateOne(
            { _id: new ObjectId(wedding.id) },
            { $set: { state: "active" } },
          );
      },
    );
    await t.test(
      "concurrent create, acceptance and revocation preserve invitation invariants",
      async () => {
        const recipient = await user();
        const creates = await Promise.allSettled(
          [1, 2].map(() =>
            inviteFamily(owner, wedding.id, {
              email: recipient.email,
              role: "MANAGER",
            }),
          ),
        );
        assert.equal(
          creates.filter((result) => result.status === "fulfilled").length,
          1,
        );
        const created = creates.find(
          (result) => result.status === "fulfilled",
        ) as PromiseFulfilledResult<Awaited<ReturnType<typeof inviteFamily>>>;
        const invite = created.value!;
        const token = await tokenFor(invite.id);
        const actions = await Promise.allSettled([
          acceptInvitation(recipient, { token }),
          revokeFamilyInvitation(owner, wedding.id, invite.id, {
            expectedVersion: 1,
          }),
        ]);
        assert.equal(
          actions.filter((result) => result.status === "fulfilled").length,
          1,
        );
        const row = await db
          .collection("membershipInvites")
          .findOne({ _id: new ObjectId(invite.id) });
        assert.equal(
          await db
            .collection("memberships")
            .countDocuments({ userId: recipient._id }),
          row!.state === "accepted" ? 1 : 0,
        );
      },
    );
    await t.test(
      "concurrent invitations to two weddings cannot move an account",
      async () => {
        const recipient = await user();
        const otherOwner = await user();
        const otherWedding = (await createWedding(
          otherOwner,
          {
            couple: { brideName: "Another", groomName: "Couple" },
            title: "Second workspace",
            timezone: "UTC",
            currency: "INR",
          },
          "invite-cross-race-123456",
        ))!;
        const first = (await inviteFamily(owner, wedding.id, {
          email: recipient.email,
          role: "MANAGER",
        }))!;
        const second = (await inviteFamily(otherOwner, otherWedding.id, {
          email: recipient.email,
          role: "ADMIN",
        }))!;
        const tokens = await Promise.all([
          tokenFor(first.id),
          tokenFor(second.id),
        ]);
        const results = await Promise.allSettled(
          tokens.map((token) => acceptInvitation(recipient, { token })),
        );
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          await db
            .collection("memberships")
            .countDocuments({ userId: recipient._id }),
          1,
        );
      },
    );
    await t.test(
      "HTTP invitation actions require authentication and trusted mutation origin",
      async () => {
        const anonymous = await handleWedding(
          new NextRequest(
            "http://localhost:3001/api/v1/membership-invitations/preview",
            {
              method: "POST",
              headers: {
                Origin: "http://localhost:3001",
                "X-MMM-CSRF": "1",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ token: "a".repeat(43) }),
            },
          ),
          "preview-invite",
        );
        assert.equal(anonymous.status, 401);
        const forged = await handleWedding(
          new NextRequest(
            "http://localhost:3001/api/v1/membership-invitations/accept",
            {
              method: "POST",
              headers: { Origin: "https://other.example", "X-MMM-CSRF": "1" },
            },
          ),
          "accept-invite",
        );
        assert.equal(forged.status, 403);
      },
    );
    await t.test(
      "worker dispatches valid invitations through mocked provider and suppresses revoked/expired ones",
      async () => {
        // Existing fixtures can have pending jobs; isolate this worker assertion.
        await db
          .collection("jobs")
          .updateMany({}, { $set: { state: "cancelled" } });
        const recipient = await user();
        const invite = (await inviteFamily(owner, wedding.id, {
          email: recipient.email,
          role: "MANAGER",
        }))!;
        const before = providerCalls;
        await sendAccountEmails();
        assert.equal(providerCalls, before + 1);
        assert.equal(
          (await db
            .collection("deliveries")
            .findOne({ membershipInviteId: new ObjectId(invite.id) }))!
            .submissionState,
          "accepted",
        );
        const expired = (await inviteFamily(owner, wedding.id, {
          email: "expired@example.test",
          role: "MANAGER",
        }))!;
        await db
          .collection("membershipInvites")
          .updateOne(
            { _id: new ObjectId(expired.id) },
            { $set: { expiresAt: new Date(0) } },
          );
        await sendAccountEmails();
        assert.equal(providerCalls, before + 1);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (db.databaseName === name && /^mmm_invite_test_[a-f0-9]{16}$/.test(name))
      await db.dropDatabase();
    await closeDatabase();
  }
});
