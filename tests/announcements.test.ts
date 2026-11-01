import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId, BSON } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateAnnouncements } from "../src/infrastructure/mongodb/migrations/017-announcements";
import { createWedding } from "../src/modules/weddings/service";
import { createAnnouncementSchema, patchAnnouncementSchema } from "../src/modules/announcements/schema";
import { announcementFor, announcementSummary, listAnnouncements, saveAnnouncement } from "../src/modules/announcements/service";
import { handleAnnouncements } from "../src/modules/announcements/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

test("announcement schema enforces plain bounded fields, shared-edit versions and pin defaults", () => {
  assert.deepEqual(createAnnouncementSchema.parse({ title: " A ", body: " B " }), { title: "A", body: "B", pinned: false });
  for (const extra of [{ title: " " }, { body: " " }, { pinned: "true" }, { createdBy: new ObjectId().toString() }, { audience: "guests" }, { title: "x".repeat(201) }, { body: "x".repeat(10001) }]) assert(!createAnnouncementSchema.safeParse({ title: "A", body: "B", ...extra }).success);
  assert(!patchAnnouncementSchema.safeParse({ expectedVersion: 1 }).success); assert(!patchAnnouncementSchema.safeParse({ title: "B" }).success); assert(patchAnnouncementSchema.safeParse({ pinned: false, expectedVersion: 1 }).success);
});
test("announcements are verified only on an asserted isolated replica", async t => {
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27195/?replicaSet=announcementsqa");
  const name = `mmm_announcements_test_${randomBytes(8).toString("hex")}`; process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex"); process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "announcementsqa");
  const key = () => randomBytes(16).toString("hex"), content = { title: "Planning update", body: "Private family instructions", pinned: false };
  async function user(): Promise<User> { const now = new Date(), email = `${key()}@example.test`; const u: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Original author", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, createdAt: now, updatedAt: now, schemaVersion: 1 }; await db.collection("users").insertOne(u); return u; }
  async function fixture() { const u = await user(), w = await createWedding(u, { title: "Private wedding", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, key()); return { u, w }; }
  async function manager(f: Awaited<ReturnType<typeof fixture>>) { const u = await user(), now = new Date(); await db.collection("users").updateOne({ _id: u._id }, { $set: { displayName: "Shared editor" } }); await db.collection("memberships").insertOne({ userId: u._id, weddingId: new ObjectId(f.w.id), role: "MANAGER", status: "active", joinedAt: now, version: 1, schemaVersion: 1, createdAt: now, updatedAt: now }); return u; }
  try {
    await migrateAccounts(db); await migrateWeddings(db);
    await t.test("before activation list/save fail closed and never create a collection", async () => {
      const f = await fixture(); await assert.rejects(listAnnouncements(f.u, f.w.id), { code: "ANNOUNCEMENTS_UNAVAILABLE" }); await assert.rejects(saveAnnouncement(f.u, f.w.id, null, content, key()), { code: "ANNOUNCEMENTS_UNAVAILABLE" }); assert(!await db.listCollections({ name: "announcements" }).hasNext());
    });
    await t.test("017 is repeatable, strict, index-only activation without wedding changes", async () => {
      const before = BSON.serialize({ rows: await db.collection("weddings").find().sort({ _id: 1 }).toArray() }), wi = await db.collection("weddings").indexes(), info = await db.listCollections({ name: "weddings" }, { nameOnly: false }).next();
      await migrateAnnouncements(db); await migrateAnnouncements(db); assert.equal(await db.collection("announcements").countDocuments(), 0);
      assert.deepEqual(BSON.serialize({ rows: await db.collection("weddings").find().sort({ _id: 1 }).toArray() }), before); assert.deepEqual(await db.collection("weddings").indexes(), wi); assert.deepEqual((await db.listCollections({ name: "weddings" }, { nameOnly: false }).next())!.options, info!.options);
      const a = await db.listCollections({ name: "announcements" }, { nameOnly: false }).next(); assert.equal(a!.options!.validationLevel, "strict"); assert.equal(a!.options!.validationAction, "error"); assert.equal(a!.options!.validator.$jsonSchema.additionalProperties, false); assert((await db.collection("announcements").indexes()).find(i => i.name === "announcements_operation")!.unique);
      await db.collection("announcements").insertOne({ title: "Incompatible legacy record" }, { bypassDocumentValidation: true }); await assert.rejects(migrateAnnouncements(db), /require review/); await db.collection("announcements").deleteMany({ title: "Incompatible legacy record" });
    });
    await t.test("both active roles share editing/pinning/removal while preserving author and private records", async () => {
      const f = await fixture(), m = await manager(f), before = await db.collection("weddings").findOne({ _id: new ObjectId(f.w.id) });
      const a = await saveAnnouncement(f.u, f.w.id, null, content, key()); await saveAnnouncement(m, f.w.id, a.id, { title: "Shared edit", pinned: true, expectedVersion: 1 }, key());
      const saved = await announcementFor(m, f.w.id, a.id); assert.equal(saved!.author.name, "Original author"); assert.equal(saved!.pinned, true); assert.equal(saved!.version, 2);
      const raw = await db.collection("announcements").findOne({ _id: new ObjectId(a.id) }); assert(raw!.createdBy.equals(f.u._id));
      for (const forbidden of [f.u.email, "passwordHash", "operationKey", "createRequestHash", "credentialVersion", "weddingId", "createdBy"]) assert(!JSON.stringify(saved).includes(forbidden));
      const after = await db.collection("weddings").findOne({ _id: before!._id }); for (const field of ["gallery", "publicPage", "couple", "storage", "version"]) assert.deepEqual(after![field], before![field]);
      await saveAnnouncement(m, f.w.id, a.id, { expectedVersion: 2 }, key(), true); assert.equal(await announcementFor(f.u, f.w.id, a.id), null); assert.equal((await listAnnouncements(f.u, f.w.id)).data.length, 0); assert((await db.collection("announcements").findOne({ _id: new ObjectId(a.id) }))!.deletedAt);
    });
    await t.test("foreign weddings, removed memberships, unverified and stale credentials are denied", async () => {
      const a = await fixture(), b = await fixture(), row = await saveAnnouncement(a.u, a.w.id, null, content, key());
      await assert.rejects(listAnnouncements(b.u, a.w.id), { status: 404 }); await assert.rejects(saveAnnouncement(b.u, a.w.id, row.id, { pinned: true, expectedVersion: 1 }, key()), { status: 404 }); assert.equal(await announcementFor(b.u, b.w.id, row.id), null);
      const m = await manager(a); await db.collection("memberships").updateOne({ userId: m._id }, { $set: { status: "removed" } }); await assert.rejects(announcementSummary(m, a.w.id));
      await db.collection("users").updateOne({ _id: a.u._id }, { $unset: { emailVerifiedAt: "" } }); await assert.rejects(listAnnouncements(a.u, a.w.id), { status: 401 }); await db.collection("users").updateOne({ _id: a.u._id }, { $set: { emailVerifiedAt: new Date(), credentialVersion: 2 } }); await assert.rejects(saveAnnouncement(a.u, a.w.id, row.id, { pinned: true, expectedVersion: 1 }, key()), { status: 401 });
    });
    await t.test("durable creation replay survives receipt expiry and removal without duplicating", async () => {
      const f = await fixture(), k = key(), results = await Promise.all([1, 2, 3].map(() => saveAnnouncement(f.u, f.w.id, null, content, k))); assert(results.every(r => r.id === results[0].id));
      assert.equal(await db.collection("activity").countDocuments({ weddingId: new ObjectId(f.w.id), action: "announcement.created" }), 1);
      await db.collection("idempotencyKeys").deleteMany({ resourceId: new ObjectId(results[0].id) }); assert.equal((await saveAnnouncement(f.u, f.w.id, null, content, k)).id, results[0].id);
      await assert.rejects(saveAnnouncement(f.u, f.w.id, null, { ...content, body: "different" }, k), { code: "IDEMPOTENCY_CONFLICT" });
      const removeKey = key(); await saveAnnouncement(f.u, f.w.id, results[0].id, { expectedVersion: 1 }, removeKey, true); await saveAnnouncement(f.u, f.w.id, results[0].id, { expectedVersion: 1 }, removeKey, true); const replay = await saveAnnouncement(f.u, f.w.id, null, content, k); assert(replay.removed); assert.equal(await db.collection("announcements").countDocuments({ weddingId: new ObjectId(f.w.id) }), 1);
    });
    await t.test("stale saves/removals cannot overwrite concurrent shared edits", async () => {
      const f = await fixture(), a = await saveAnnouncement(f.u, f.w.id, null, content, key());
      const races = await Promise.allSettled(["First", "Second"].map(title => saveAnnouncement(f.u, f.w.id, a.id, { title, expectedVersion: 1 }, key()))); assert.equal(races.filter(r => r.status === "fulfilled").length, 1); assert.equal((await announcementFor(f.u, f.w.id, a.id))!.version, 2);
      await assert.rejects(saveAnnouncement(f.u, f.w.id, a.id, { expectedVersion: 1 }, key(), true), { code: "VERSION_CONFLICT" });
    });
    await t.test("archive allows reading and completed replay but denies every new mutation", async () => {
      const f = await fixture(), k = key(), a = await saveAnnouncement(f.u, f.w.id, null, content, k); await db.collection("weddings").updateOne({ _id: new ObjectId(f.w.id) }, { $set: { state: "archived" } });
      assert.equal((await listAnnouncements(f.u, f.w.id)).data.length, 1); assert.equal((await saveAnnouncement(f.u, f.w.id, null, content, k)).id, a.id);
      for (const patch of [{ title: "Edit", expectedVersion: 1 }, { pinned: true, expectedVersion: 1 }]) await assert.rejects(saveAnnouncement(f.u, f.w.id, a.id, patch, key()), { code: "WEDDING_ARCHIVED" }); await assert.rejects(saveAnnouncement(f.u, f.w.id, a.id, { expectedVersion: 1 }, key(), true), { code: "WEDDING_ARCHIVED" }); await assert.rejects(saveAnnouncement(f.u, f.w.id, null, content, key()), { code: "WEDDING_ARCHIVED" });
    });
    await t.test("pin/creation/ID order paginates ties, scopes cursors and matches the top-three dashboard", async () => {
      const f = await fixture(); for (let i = 0; i < 7; i++) await saveAnnouncement(f.u, f.w.id, null, { ...content, title: `Post ${i}`, pinned: i % 3 === 0 }, key()); await db.collection("announcements").updateMany({ weddingId: new ObjectId(f.w.id) }, { $set: { createdAt: new Date("2026-01-01") } });
      const expected = await db.collection("announcements").find({ weddingId: new ObjectId(f.w.id) }).sort({ pinned: -1, createdAt: -1, _id: -1 }).toArray();
      const ids: string[] = []; let cursor: string | null = null; do { const p = await listAnnouncements(f.u, f.w.id, { limit: 2, ...(cursor ? { cursor } : {}) }); ids.push(...p.data.map(a => a.id)); cursor = p.pagination.nextCursor; } while (cursor); assert.deepEqual(ids, expected.map(e => e._id.toString()));
      assert.deepEqual((await announcementSummary(f.u, f.w.id)).map(a => a.id), ids.slice(0, 3));
      const first = await listAnnouncements(f.u, f.w.id, { limit: 2 }), other = await manager(f); await assert.rejects(listAnnouncements(other, f.w.id, { limit: 2, cursor: first.pagination.nextCursor }), { code: "INVALID_CURSOR" }); await assert.rejects(listAnnouncements(f.u, f.w.id, { limit: 3, cursor: first.pagination.nextCursor }), { code: "INVALID_CURSOR" });
      const tampered = JSON.parse(Buffer.from(first.pagination.nextCursor!, "base64url").toString()); tampered.pinned = !tampered.pinned; await assert.rejects(listAnnouncements(f.u, f.w.id, { limit: 2, cursor: Buffer.from(JSON.stringify(tampered)).toString("base64url") }), { code: "INVALID_CURSOR" });
    });
    await t.test("HTTP blocks guest credentials/CSRF/query misuse and uses private response headers", async () => {
      const f = await fixture(), token = randomBytes(32).toString("base64url"), now = new Date(); await db.collection("sessions").insertOne({ userId: f.u._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3001/api/v1/weddings/${f.w.id}/announcements`, headers = { Origin: "http://localhost:3001", "X-MMM-CSRF": "1", "Content-Type": "application/json", Cookie: `mmm_session=${token}`, "Idempotency-Key": key() };
      assert.equal((await handleAnnouncements(new NextRequest(url, { headers: { Cookie: "mmm_gallery=guest; mmm_household=guest" } }), "list", f.w.id)).status, 401);
      for (const patch of [{ Origin: "https://foreign.example" }, { "X-MMM-CSRF": "" }]) assert.equal((await handleAnnouncements(new NextRequest(url, { method: "POST", headers: { ...headers, ...patch }, body: JSON.stringify(content) }), "create", f.w.id)).status, 403);
      const saved = await handleAnnouncements(new NextRequest(url, { method: "POST", headers, body: JSON.stringify(content) }), "create", f.w.id); assert.equal(saved.status, 201); assert.equal(saved.headers.get("cache-control"), "private, no-store"); assert.equal(saved.headers.get("vary"), "Cookie");
      for (const query of ["?limit=1&limit=2", "?audience=public", "?limit=999"]) assert((await handleAnnouncements(new NextRequest(url + query, { headers }), "list", f.w.id)).status >= 400);
      const raw = JSON.stringify(await (await handleAnnouncements(new NextRequest(url, { headers }), "list", f.w.id)).json()); assert(!raw.includes(f.u.email)); assert(!raw.includes("operationKey"));
    });
  } finally { if (db.databaseName === name && /^mmm_announcements_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase(); await closeDatabase(); }
});
