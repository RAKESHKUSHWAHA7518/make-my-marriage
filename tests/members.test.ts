import "../scripts/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import {
  getDatabase,
  closeDatabase,
} from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateMembershipInvites } from "../src/infrastructure/mongodb/migrations/003-membership-invites";
import { createWedding, weddingFor } from "../src/modules/weddings/service";
import { manageMember } from "../src/modules/weddings/members";
import { listWeddingAccess } from "../src/modules/weddings/access";
import { inviteFamily } from "../src/modules/weddings/invitations";
import { handleWedding } from "../src/modules/weddings/http";
import type { User } from "../src/modules/identity/service";

test("member administration preserves an active ADMIN in an isolated database", async (t) => {
  const name = `mmm_member_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name;
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.ACCOUNT_EMAIL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.RESEND_API_KEY = "never-sent-test-key";
  process.env.RESEND_FROM_EMAIL = "test@example.test";
  const db = await getDatabase();
  async function user() {
    const now = new Date();
    const email = `${randomBytes(8).toString("hex")}@example.test`;
    const row: User = {
      _id: new ObjectId(),
      email,
      emailNormalized: email,
      displayName: "Member QA",
      passwordHash: "unused",
      status: "active",
      emailVerifiedAt: now,
      credentialVersion: 1,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection<User>("users").insertOne(row);
    return row;
  }
  async function fixture() {
    const owner = await user();
    const wedding = (await createWedding(
      owner,
      {
        couple: { brideName: "QA Bride", groomName: "QA Groom" },
        title: "Member QA",
        timezone: "Asia/Kolkata",
        currency: "INR",
      },
      randomBytes(16).toString("hex"),
    ))!;
    const membership = (await db
      .collection("memberships")
      .findOne({ userId: owner._id }))!;
    return { owner, wedding, membership };
  }
  async function add(weddingId: string, role: "ADMIN" | "MANAGER") {
    const actor = await user();
    const now = new Date();
    const _id = new ObjectId();
    await db
      .collection("memberships")
      .insertOne({
        _id,
        userId: actor._id,
        weddingId: new ObjectId(weddingId),
        role,
        status: "active",
        version: 1,
        joinedAt: now,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
    return { actor, id: _id.toString() };
  }
  try {
    await migrateAccounts(db);
    await migrateWeddings(db);
    await migrateMembershipInvites(db);
    await t.test(
      "last ADMIN cannot be demoted or removed; stale saves never overwrite",
      async () => {
        const { owner, wedding, membership } = await fixture();
        await assert.rejects(
          manageMember(owner, wedding.id, membership._id.toString(), "role", {
            role: "MANAGER",
            expectedVersion: 1,
          }),
          { code: "LAST_ADMIN" },
        );
        await assert.rejects(
          manageMember(owner, wedding.id, membership._id.toString(), "remove", {
            expectedVersion: 1,
          }),
          { code: "LAST_ADMIN" },
        );
        await assert.rejects(
          manageMember(owner, wedding.id, membership._id.toString(), "role", {
            role: "ADMIN",
            expectedVersion: 2,
          }),
          { code: "VERSION_CONFLICT", currentVersion: 1 },
        );
        const saved = (await db
          .collection("memberships")
          .findOne({ _id: membership._id }))!;
        assert.equal(saved.role, "ADMIN");
        assert.equal(saved.version, 1);
        assert.equal(
          (await listWeddingAccess(owner, wedding.id, "members", { limit: 1 }))
            .activeAdminCount,
          1,
        );
      },
    );
    await t.test(
      "promotion permits self-demotion, then removes administrative privileges immediately",
      async () => {
        const { owner, wedding, membership } = await fixture();
        const manager = await add(wedding.id, "MANAGER");
        const promoted = (await manageMember(
          owner,
          wedding.id,
          manager.id,
          "role",
          { role: "ADMIN", expectedVersion: 1 },
        ))!;
        assert.equal(promoted.role, "ADMIN");
        assert.equal(promoted.version, 2);
        await manageMember(
          owner,
          wedding.id,
          membership._id.toString(),
          "role",
          { role: "MANAGER", expectedVersion: 1 },
        );
        await assert.rejects(
          manageMember(owner, wedding.id, manager.id, "remove", {
            expectedVersion: 2,
          }),
          { code: "FORBIDDEN" },
        );
        await assert.rejects(
          inviteFamily(owner, wedding.id, {
            email: "no-access@example.test",
            role: "ADMIN",
          }),
          { code: "FORBIDDEN" },
        );
        const audit = await db
          .collection("activity")
          .findOne({
            weddingId: new ObjectId(wedding.id),
            action: "membership.role_changed",
            entityId: new ObjectId(manager.id),
          });
        assert.equal(audit!.metadata.beforeRole, "MANAGER");
        assert.equal(audit!.metadata.afterRole, "ADMIN");
      },
    );
    await t.test(
      "removal preserves account, history and retained membership but denies wedding access",
      async () => {
        const { owner, wedding } = await fixture();
        const target = await add(wedding.id, "MANAGER");
        await manageMember(owner, wedding.id, target.id, "remove", {
          expectedVersion: 1,
        });
        const removed = (await db
          .collection("memberships")
          .findOne({ _id: new ObjectId(target.id) }))!;
        assert.equal(removed.status, "removed");
        assert.equal(removed.version, 2);
        assert.ok(removed.removedAt);
        assert.equal(
          await db
            .collection("users")
            .countDocuments({ _id: target.actor._id }),
          1,
        );
        assert.equal(await weddingFor(target.actor), null);
        await assert.rejects(
          listWeddingAccess(target.actor, wedding.id, "members"),
          { status: 404 },
        );
        await assert.rejects(
          createWedding(
            target.actor,
            {
              couple: { brideName: "Other", groomName: "Couple" },
              title: "Second",
              timezone: "UTC",
              currency: "INR",
            },
            "removed-account-create-123",
          ),
          { code: "ACCESS_REMOVED" },
        );
        await assert.rejects(
          manageMember(owner, wedding.id, target.id, "role", {
            role: "ADMIN",
            expectedVersion: 2,
          }),
          { code: "MEMBER_REMOVED" },
        );
        assert.equal(
          await db
            .collection("activity")
            .countDocuments({
              entityId: removed._id,
              action: "membership.removed",
            }),
          1,
        );
      },
    );
    await t.test(
      "archive blocks roles but permits ADMIN removal with last-ADMIN protection",
      async () => {
        const { owner, wedding, membership } = await fixture();
        const target = await add(wedding.id, "MANAGER");
        await db
          .collection("weddings")
          .updateOne(
            { _id: new ObjectId(wedding.id) },
            { $set: { state: "archived" } },
          );
        await assert.rejects(
          manageMember(owner, wedding.id, target.id, "role", {
            role: "ADMIN",
            expectedVersion: 1,
          }),
          { code: "WEDDING_ARCHIVED" },
        );
        await manageMember(owner, wedding.id, target.id, "remove", {
          expectedVersion: 1,
        });
        await assert.rejects(
          manageMember(owner, wedding.id, membership._id.toString(), "remove", {
            expectedVersion: 1,
          }),
          { code: "LAST_ADMIN" },
        );
      },
    );
    await t.test(
      "foreign members, MANAGER actors, invalid payloads and revoked credentials are denied",
      async () => {
        const first = await fixture();
        const second = await fixture();
        const manager = await add(first.wedding.id, "MANAGER");
        await assert.rejects(
          manageMember(
            first.owner,
            first.wedding.id,
            second.membership._id.toString(),
            "remove",
            { expectedVersion: 1 },
          ),
          { status: 404 },
        );
        await assert.rejects(
          manageMember(
            second.owner,
            first.wedding.id,
            first.membership._id.toString(),
            "remove",
            { expectedVersion: 1 },
          ),
          { status: 404 },
        );
        await assert.rejects(
          manageMember(
            manager.actor,
            first.wedding.id,
            first.membership._id.toString(),
            "remove",
            { expectedVersion: 1 },
          ),
          { code: "FORBIDDEN" },
        );
        await assert.rejects(
          manageMember(first.owner, first.wedding.id, manager.id, "role", {
            role: "OWNER",
            expectedVersion: 1,
          }),
        );
        await assert.rejects(
          manageMember(first.owner, first.wedding.id, manager.id, "remove", {
            expectedVersion: 1,
            userId: first.owner._id.toString(),
          }),
        );
        await db
          .collection("users")
          .updateOne(
            { _id: first.owner._id },
            { $inc: { credentialVersion: 1 } },
          );
        await assert.rejects(
          manageMember(first.owner, first.wedding.id, manager.id, "remove", {
            expectedVersion: 1,
          }),
          { status: 401 },
        );
      },
    );
    await t.test(
      "simultaneous self-demotions and cross-removals retain an ADMIN",
      async () => {
        for (const action of ["role", "remove"] as const) {
          const { owner, wedding, membership } = await fixture();
          const other = await add(wedding.id, "ADMIN");
          const results = await Promise.allSettled([
            manageMember(
              owner,
              wedding.id,
              action === "role" ? membership._id.toString() : other.id,
              action,
              action === "role"
                ? { role: "MANAGER", expectedVersion: 1 }
                : { expectedVersion: 1 },
            ),
            manageMember(
              other.actor,
              wedding.id,
              action === "role" ? other.id : membership._id.toString(),
              action,
              action === "role"
                ? { role: "MANAGER", expectedVersion: 1 }
                : { expectedVersion: 1 },
            ),
          ]);
          assert.equal(
            results.filter((result) => result.status === "fulfilled").length,
            1,
          );
          assert.equal(
            await db
              .collection("memberships")
              .countDocuments({
                weddingId: new ObjectId(wedding.id),
                role: "ADMIN",
                status: "active",
              }),
            1,
          );
        }
      },
    );
    await t.test(
      "concurrent edits to one member have one winner and no-op saves do not create history",
      async () => {
        const { owner, wedding } = await fixture();
        const target = await add(wedding.id, "MANAGER");
        const results = await Promise.allSettled(
          ["role", "remove"].map((action) =>
            manageMember(
              owner,
              wedding.id,
              target.id,
              action as "role" | "remove",
              action === "role"
                ? { role: "ADMIN", expectedVersion: 1 }
                : { expectedVersion: 1 },
            ),
          ),
        );
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          await db
            .collection("activity")
            .countDocuments({ entityId: new ObjectId(target.id) }),
          1,
        );
        const other = await add(wedding.id, "MANAGER");
        const saved = (await manageMember(owner, wedding.id, other.id, "role", {
          role: "MANAGER",
          expectedVersion: 1,
        }))!;
        assert.equal(saved.version, 1);
        assert.equal(
          await db
            .collection("activity")
            .countDocuments({ entityId: new ObjectId(other.id) }),
          0,
        );
      },
    );
    await t.test(
      "HTTP administration rejects missing sessions and foreign origins",
      async () => {
        const anonymous = await handleWedding(
          new NextRequest(
            "http://localhost:3001/api/v1/weddings/test/members/test",
            {
              method: "PATCH",
              headers: { Origin: "http://localhost:3001", "X-MMM-CSRF": "1" },
            },
          ),
          "change-role",
          "test",
          "test",
        );
        assert.equal(anonymous.status, 401);
        const forged = await handleWedding(
          new NextRequest(
            "http://localhost:3001/api/v1/weddings/test/members/test/remove",
            {
              method: "POST",
              headers: { Origin: "https://other.example", "X-MMM-CSRF": "1" },
            },
          ),
          "remove-member",
          "test",
          "test",
        );
        assert.equal(forged.status, 403);
      },
    );
  } finally {
    if (db.databaseName === name && /^mmm_member_test_[a-f0-9]{16}$/.test(name))
      await db.dropDatabase();
    await closeDatabase();
  }
});
