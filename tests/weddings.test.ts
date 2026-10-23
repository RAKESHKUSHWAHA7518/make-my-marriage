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
import { listWeddingAccess } from "../src/modules/weddings/access";
import {
  createWedding,
  currentWedding,
  weddingFor,
  updateWedding,
} from "../src/modules/weddings/service";
import {
  createWeddingSchema,
  patchWeddingSchema,
  budgetToMinor,
} from "../src/modules/weddings/schema";
import { handleWedding } from "../src/modules/weddings/http";
import type { User } from "../src/modules/identity/service";

test("wedding onboarding invariants in an isolated database", async (t) => {
  const previous = process.env.MONGODB_DB_NAME;
  const name = `mmm_wedding_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name;
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_ORIGIN = "http://localhost:3001";
  const db = await getDatabase();
  const input = {
    couple: { brideName: "Priya", groomName: "Rakesh" },
    title: "Our Wedding",
    timezone: "Asia/Kolkata",
    currency: "INR",
    budgetMinor: "50000001",
  };
  async function user(verified = true) {
    const now = new Date();
    const row: User = {
      _id: new ObjectId(),
      email: `${randomBytes(8).toString("hex")}@example.test`,
      emailNormalized: randomBytes(12).toString("hex"),
      displayName: "Test Organizer",
      passwordHash: "not-used",
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
  try {
    await migrateAccounts(db);
    await migrateWeddings(db);
    await migrateWeddings(db);
    await migrateMembershipInvites(db);
    await migrateMembershipInvites(db);
    await t.test("strict validation and exact money", () => {
      assert.equal(budgetToMinor("500000.01"), "50000001");
      assert.equal(budgetToMinor(""), undefined);
      assert.throws(() => budgetToMinor("-1"));
      assert.throws(() => budgetToMinor("1.001"));
      assert.throws(() => budgetToMinor("92233720368547758.08"));
      for (const extra of [
        { role: "ADMIN" },
        { weddingDate: "2027-02-30" },
        { timezone: "Wrong/Zone" },
        { timezone: "+05:30" },
        { budgetMinor: "-1" },
      ])
        assert.equal(
          createWeddingSchema.safeParse({ ...input, ...extra }).success,
          false,
        );
    });
    await t.test("unverified and missing key writes roll back", async () => {
      const actor = await user(false);
      await assert.rejects(
        createWedding(actor, input, "unverified-key-12345"),
        { code: "EMAIL_NOT_VERIFIED" },
      );
      await assert.rejects(createWedding(actor, input, null), {
        code: "IDEMPOTENCY_KEY_REQUIRED",
      });
      assert.equal(await db.collection("weddings").countDocuments(), 0);
    });
    const actor = await user();
    await t.test(
      "family lists scope access, paginate safely and hide invitation secrets",
      async () => {
        const owner = await user();
        const manager = await user();
        const outsider = await user();
        const wedding = await createWedding(
          owner,
          input,
          "family-lists-key-12345",
        );
        const now = new Date();
        await db
          .collection("memberships")
          .insertOne({
            userId: manager._id,
            weddingId: new ObjectId(wedding.id),
            role: "MANAGER",
            status: "active",
            joinedAt: now,
            version: 1,
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          });
        const first = await listWeddingAccess(owner, wedding.id, "members", {
          limit: 1,
        });
        assert.equal(first.data.length, 1);
        assert.equal(first.pagination.hasMore, true);
        const second = await listWeddingAccess(owner, wedding.id, "members", {
          limit: 1,
          cursor: first.pagination.nextCursor,
        });
        assert.notEqual(first.data[0]!.id, second.data[0]!.id);
        assert.equal(second.pagination.hasMore, false);
        await assert.rejects(
          listWeddingAccess(owner, wedding.id, "members", {
            role: "ADMIN",
            cursor: first.pagination.nextCursor,
          }),
          { code: "INVALID_CURSOR" },
        );
        await assert.rejects(
          listWeddingAccess(owner, wedding.id, "members", { cursor: "broken" }),
          { code: "INVALID_CURSOR" },
        );
        await assert.rejects(
          listWeddingAccess(owner, wedding.id, "members", { limit: 51 }),
        );
        assert.equal(
          (await listWeddingAccess(manager, wedding.id, "members")).data.length,
          2,
        );
        await assert.rejects(
          listWeddingAccess(manager, wedding.id, "invitations"),
          { status: 403 },
        );
        await assert.rejects(
          listWeddingAccess(outsider, wedding.id, "members"),
          { status: 404 },
        );
        const invite = {
          weddingId: new ObjectId(wedding.id),
          emailNormalized: "family@example.test",
          role: "MANAGER",
          tokenHash: "a".repeat(64),
          state: "pending",
          invitedBy: owner._id,
          expiresAt: new Date(now.getTime() - 1000),
          version: 1,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection("membershipInvites").insertOne(invite);
        await assert.rejects(
          db
            .collection("membershipInvites")
            .insertOne({ ...invite, tokenHash: "b".repeat(64) }),
          { code: 11000 },
        );
        await assert.rejects(
          db
            .collection("membershipInvites")
            .insertOne({
              ...invite,
              emailNormalized: "invalid@example.test",
              tokenHash: "c".repeat(64),
              role: "OWNER",
            }),
          { code: 121 },
        );
        const history = await listWeddingAccess(
          owner,
          wedding.id,
          "invitations",
          { state: "expired" },
        );
        assert.equal(history.data.length, 1);
        assert.doesNotMatch(
          JSON.stringify(history),
          /tokenHash|passwordHash|credentialVersion|encryptedSecret/,
        );
        assert.equal(
          (
            await listWeddingAccess(owner, wedding.id, "invitations", {
              state: "pending",
            })
          ).data.length,
          0,
        );
        await db
          .collection("weddings")
          .updateOne(
            { _id: new ObjectId(wedding.id) },
            { $set: { state: "archived" } },
          );
        assert.equal(
          (await listWeddingAccess(owner, wedding.id, "members")).data.length,
          2,
        );
        await db
          .collection("memberships")
          .updateOne({ userId: manager._id }, { $set: { status: "removed" } });
        await assert.rejects(
          listWeddingAccess(manager, wedding.id, "members"),
          { status: 404 },
        );
      },
    );
    await t.test(
      "wedding edits validate, clear optional values and preserve privacy",
      async () => {
        const editor = await user();
        const wedding = await createWedding(
          editor,
          { ...input, weddingDate: "2027-02-14" },
          "edit-details-key-12345",
        );
        for (const payload of [
          { expectedVersion: 1 },
          { expectedVersion: 0, title: "Test" },
          { expectedVersion: 1, state: "archived" },
          { expectedVersion: 1, weddingDate: "2027-02-30" },
        ])
          assert.equal(patchWeddingSchema.safeParse(payload).success, false);
        const changed = await updateWedding(editor, wedding.id, {
          expectedVersion: 1,
          title: "Our new title",
          weddingDate: null,
          budgetMinor: null,
          timezone: "Europe/London",
        });
        assert.equal(changed!.version, 2);
        const saved = (await weddingFor(editor))!;
        assert.equal(saved.title, "Our new title");
        assert.equal(saved.weddingDate, undefined);
        assert.equal(saved.budgetMinor, undefined);
        assert.equal(saved.timezone, "Europe/London");
        assert.deepEqual(saved.couple, input.couple);
        assert.equal(saved.publicPage.state, "unpublished");
        assert.equal(saved.gallery.isEnabled, false);
        assert.equal(saved.currencyLocked, false);
        assert.equal(
          await db.collection("activity").countDocuments({
            weddingId: new ObjectId(wedding.id),
            action: "wedding.updated",
          }),
          1,
        );
        await assert.rejects(
          updateWedding(editor, wedding.id, {
            expectedVersion: 1,
            title: "Stale",
          }),
          { code: "VERSION_CONFLICT", currentVersion: 2 },
        );
        await updateWedding(editor, wedding.id, {
          expectedVersion: 2,
          budgetMinor: "0",
          weddingDate: "2028-02-29",
        });
        assert.equal((await weddingFor(editor))!.budgetMinor, "0");
      },
    );
    await t.test(
      "ADMIN-only edits, MANAGER read access, currency lock and archive/removal guards",
      async () => {
        const editor = await user();
        const outsider = await user();
        const wedding = await createWedding(
          editor,
          input,
          "edit-guards-key-123456",
        );
        await db
          .collection("memberships")
          .updateOne({ userId: editor._id }, { $set: { role: "MANAGER" } });
        const before = await db
          .collection("weddings")
          .findOne({ _id: new ObjectId(wedding.id) });
        await assert.rejects(
          updateWedding(editor, wedding.id, {
            expectedVersion: 1,
            currency: "USD",
            title: "Manager must not change this",
          }),
          { status: 403, code: "FORBIDDEN" },
        );
        assert.deepEqual(
          await db
            .collection("weddings")
            .findOne({ _id: new ObjectId(wedding.id) }),
          before,
        );
        const managerView = await weddingFor(editor);
        assert.equal(managerView!.title, input.title);
        assert.equal(managerView!.role, "MANAGER");
        await db
          .collection("memberships")
          .updateOne({ userId: editor._id }, { $set: { role: "ADMIN" } });
        await updateWedding(editor, wedding.id, {
          expectedVersion: 1,
          currency: "USD",
        });
        await db.collection("expenses").insertOne({
          weddingId: new ObjectId(wedding.id),
          deletedAt: new Date(),
        });
        assert.equal((await weddingFor(editor))!.currencyLocked, true);
        await assert.rejects(
          updateWedding(editor, wedding.id, {
            expectedVersion: 2,
            currency: "EUR",
          }),
          { code: "CURRENCY_LOCKED" },
        );
        await updateWedding(editor, wedding.id, {
          expectedVersion: 2,
          title: "Still editable",
          currency: "USD",
        });
        await assert.rejects(
          updateWedding(outsider, wedding.id, {
            expectedVersion: 3,
            title: "Unauthorized",
          }),
          { status: 404 },
        );
        await db
          .collection("weddings")
          .updateOne(
            { _id: new ObjectId(wedding.id) },
            { $set: { state: "archived" } },
          );
        await assert.rejects(
          updateWedding(editor, wedding.id, {
            expectedVersion: 3,
            title: "Archived",
          }),
          { code: "WEDDING_ARCHIVED" },
        );
        await db
          .collection("memberships")
          .updateOne({ userId: editor._id }, { $set: { status: "removed" } });
        await assert.rejects(
          updateWedding(editor, wedding.id, {
            expectedVersion: 3,
            title: "Removed",
          }),
          { status: 404 },
        );
      },
    );
    await t.test(
      "concurrent wedding edits have exactly one winner",
      async () => {
        const editor = await user();
        const wedding = await createWedding(
          editor,
          input,
          "edit-racing-key-12345",
        );
        const results = await Promise.allSettled(
          ["First", "Second"].map((title) =>
            updateWedding(editor, wedding.id, { expectedVersion: 1, title }),
          ),
        );
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        const failure = results.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult;
        assert.equal(failure.reason.code, "VERSION_CONFLICT");
        assert.equal((await weddingFor(editor))!.version, 2);
        assert.equal(
          await db.collection("activity").countDocuments({
            weddingId: new ObjectId(wedding.id),
            action: "wedding.updated",
          }),
          1,
        );
      },
    );
    let id: string;
    await t.test(
      "concurrent identical submissions create one atomic workspace",
      async () => {
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            createWedding(actor, input, "same-submission-123456"),
          ),
        );
        id = results[0]!.id;
        assert.ok(results.every((row) => row?.id === id));
        assert.equal(
          await db
            .collection("weddings")
            .countDocuments({ createdBy: actor._id }),
          1,
        );
        assert.equal(
          await db
            .collection("activity")
            .countDocuments({ weddingId: new ObjectId(id) }),
          1,
        );
        const row = await db
          .collection("weddings")
          .findOne({ _id: new ObjectId(id) });
        assert.equal(row!.budgetMinor.toString(), input.budgetMinor);
        assert.equal(row!.publicPage.state, "unpublished");
        assert.equal(row!.gallery.isEnabled, false);
        assert.equal(row!.gallery.guestUploadsEnabled, false);
        assert.equal(
          (await db.collection("memberships").findOne({ userId: actor._id }))!
            .role,
          "ADMIN",
        );
      },
    );
    await t.test(
      "replay conflicts, one wedding, tenant isolation and no secret DTOs",
      async () => {
        await assert.rejects(
          createWedding(
            actor,
            { ...input, title: "Changed" },
            "same-submission-123456",
          ),
          { code: "IDEMPOTENCY_CONFLICT" },
        );
        await assert.rejects(
          createWedding(actor, input, "different-submission-123"),
          { code: "WEDDING_ALREADY_EXISTS" },
        );
        const outsider = await user();
        assert.equal(await currentWedding(outsider), null);
        await assert.rejects(weddingFor(outsider, id!), { status: 404 });
        assert.doesNotMatch(
          JSON.stringify(await weddingFor(actor)),
          /tokenHash|encryptedSecret|ciphertext/,
        );
        await db
          .collection("weddings")
          .updateOne(
            { _id: new ObjectId(id!) },
            { $set: { state: "archived" } },
          );
        assert.equal((await weddingFor(actor))!.state, "archived");
      },
    );
    await t.test(
      "removed membership blocks reads, replay and another wedding",
      async () => {
        await db
          .collection("memberships")
          .updateOne({ userId: actor._id }, { $set: { status: "removed" } });
        assert.equal(await currentWedding(actor), null);
        await assert.rejects(weddingFor(actor, id!), { status: 404 });
        await assert.rejects(
          createWedding(actor, input, "same-submission-123456"),
          { code: "ACCESS_REMOVED" },
        );
        await assert.rejects(
          createWedding(actor, input, "different-submission-123"),
          { code: "ACCESS_REMOVED" },
        );
      },
    );
    await t.test(
      "different keys racing still create only one wedding",
      async () => {
        const other = await user();
        const results = await Promise.allSettled([
          createWedding(other, input, "race-one-123456789"),
          createWedding(other, input, "race-two-123456789"),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          await db
            .collection("memberships")
            .countDocuments({ userId: other._id }),
          1,
        );
      },
    );
    await t.test(
      "HTTP requires session and trusted mutation origin",
      async () => {
        const unauthenticated = await handleWedding(
          new NextRequest("http://localhost:3001/api/v1/weddings/current"),
          "current",
        );
        assert.equal(unauthenticated.status, 401);
        assert.match(unauthenticated.headers.get("cache-control")!, /no-store/);
        const forged = await handleWedding(
          new NextRequest("http://localhost:3001/api/v1/weddings", {
            method: "POST",
            headers: { Origin: "https://other.example" },
          }),
          "create",
        );
        assert.equal(forged.status, 403);
      },
    );
  } finally {
    if (
      db.databaseName === name &&
      /^mmm_wedding_test_[a-f0-9]{16}$/.test(name)
    )
      await db.dropDatabase();
    await closeDatabase();
    process.env.MONGODB_DB_NAME = previous;
  }
});
