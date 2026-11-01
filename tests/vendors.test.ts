import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateExpenses } from "../src/infrastructure/mongodb/migrations/011-expenses";
import { migrateVendors } from "../src/infrastructure/mongodb/migrations/012-vendors";
import { createWedding } from "../src/modules/weddings/service";
import { createEvent } from "../src/modules/events/service";
import { saveExpense, expenseSummary } from "../src/modules/expenses/service";
import { listVendors, vendorFor, vendorEventChoices, saveVendor } from "../src/modules/vendors/service";
import { createVendorSchema, patchVendorSchema } from "../src/modules/vendors/schema";
import { handleVendors } from "../src/modules/vendors/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

test("manual schema rejects discovery/booking fields, invalid contacts and duplicate associations", () => {
  const input = { source: "MANUAL", name: "Test", category: "venue", eventIds: [] };
  assert.equal(createVendorSchema.parse(input).name, "Test");
  for (const extra of [{ name: " " }, { category: "unknown" }, { source: "GOOGLE_PLACES" }, { googlePlaceId: "place" }, { contractAmount: "100" }, { contact: { website: "https://example.test" } }, { contact: { email: "bad" } }, { contact: { phone: "javascript:alert(1)" } }, { eventIds: ["a".repeat(24), "a".repeat(24)] }]) assert.equal(createVendorSchema.safeParse({ ...input, ...extra }).success, false);
  assert.equal(patchVendorSchema.safeParse({ expectedVersion: 1 }).success, false); assert.equal(patchVendorSchema.safeParse({ expectedVersion: 1, source: "MANUAL" }).success, false);
});

test("manual vendor management uses only a disposable localhost database", async t => {
  // No .env loader or Atlas fallback is permitted for state-changing tests.
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27193/?replicaSet=vendorsqa");
  const name = `mmm_vendors_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex"); process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "vendorsqa");
  const key = () => randomBytes(16).toString("hex"), input = { source: "MANUAL", name: "Family caterer", category: "catering", eventIds: [] };
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`;
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Vendor QA", passwordHash: "unused", credentialVersion: 1, status: "active", emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated Vendor QA", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, key()); return { user, wedding };
  }
  async function event(f: Awaited<ReturnType<typeof fixture>>) { return createEvent(f.user, f.wedding.id, { name: "Haldi", type: "haldi", startsAt: "2027-01-01T00:00:00Z", venue: { name: "Test", address: "Test address" } }, key()); }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db); await migrateExpenses(db);
    await t.test("missing activation fails closed without implicitly creating vendors", async () => {
      const f = await fixture(); await assert.rejects(listVendors(f.user, f.wedding.id), { code: "VENDORS_UNAVAILABLE" }); assert.equal(await db.listCollections({ name: "vendors" }).hasNext(), false);
    });
    await migrateVendors(db); await migrateVendors(db);
    await t.test("ADMIN/MANAGER can manage contacts with strict schema, audit and safe projection", async () => {
      for (const role of ["ADMIN", "MANAGER"]) {
        const f = await fixture(); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role } });
        const v = await saveVendor(f.user, f.wedding.id, null, { ...input, contact: { person: "Coordinator", phone: "+91 98765 43210", email: "qa@example.test", address: "Test address" } }, key());
        assert.equal(v.source, "MANUAL"); assert.equal(v.status, "active"); assert.deepEqual(v.eventIds, []);
        assert(!Object.keys(v).some(k => ["operationKey", "requestHash", "createdBy", "weddingId"].includes(k)));
        await assert.rejects(db.collection("vendors").updateOne({ _id: new ObjectId(v.id) }, { $set: { booking: true } }));
        assert.equal((await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 1, name: "Updated" }, key())).version, 2);
        assert.equal((await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 2 }, key(), true)).status, "removed");
        assert.equal(await db.collection("activity").countDocuments({ entityId: new ObjectId(v.id) }), 3);
        assert.equal(await db.collection("deliveries").countDocuments({ weddingId: new ObjectId(f.wedding.id) }), 0);
      }
      assert.equal((await db.collection("vendors").indexes()).filter(i => i.name?.startsWith("vendors_")).length, 4);
    });
    await t.test("create retries and replay after receipt expiry do not duplicate contacts", async () => {
      const f = await fixture(), k = key(); const results = await Promise.all([1, 2, 3].map(() => saveVendor(f.user, f.wedding.id, null, input, k))); assert.equal(new Set(results.map(v => v.id)).size, 1);
      await assert.rejects(saveVendor(f.user, f.wedding.id, null, { ...input, name: "Different" }, k), { code: "IDEMPOTENCY_CONFLICT" });
      await db.collection("idempotencyKeys").deleteMany({ resourceId: new ObjectId(results[0].id) });
      assert.equal((await saveVendor(f.user, f.wedding.id, null, input, k)).id, results[0].id);
      assert.equal(await db.collection("vendors").countDocuments({ weddingId: new ObjectId(f.wedding.id) }), 1);
      // Separate intentional entries with the same name/contact are allowed, never silently merged.
      await saveVendor(f.user, f.wedding.id, null, input, key()); assert.equal(await db.collection("vendors").countDocuments({ weddingId: new ObjectId(f.wedding.id) }), 2);
    });
    await t.test("version checks and immutable edits/removal prevent concurrent overwrites", async () => {
      const f = await fixture(), v = await saveVendor(f.user, f.wedding.id, null, input, key()), k = key(), patch = { expectedVersion: 1, notes: "Notes" };
      const edits = await Promise.all([1, 2].map(() => saveVendor(f.user, f.wedding.id, v.id, patch, k))); assert(edits.every(v => v.version === 2));
      const race = await Promise.allSettled(["A", "B"].map(name => saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 2, name }, key()))); assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
      await assert.rejects(saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 2 }, key(), true), { code: "VERSION_CONFLICT", currentVersion: 3 });
      const removeKey = key(); await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 3 }, removeKey, true); await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 3 }, removeKey, true);
      assert.equal(await db.collection("activity").countDocuments({ entityId: new ObjectId(v.id), action: "vendor.removed" }), 1);
      assert.equal((await vendorFor(f.user, f.wedding.id, v.id))!.status, "removed");
    });
    await t.test("optional contacts replace/clear explicitly; note-only patches retain events", async () => {
      const f = await fixture(), e = await event(f); let v = await saveVendor(f.user, f.wedding.id, null, { ...input, eventIds: [e.id], contact: { person: "Test", email: "qa@example.test" }, notes: "Old" }, key());
      v = await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 1, contact: { phone: "12345" }, notes: null }, key()); assert.deepEqual(v.contact, { phone: "12345" }); assert.equal(v.notes, undefined); assert.deepEqual(v.eventIds, [e.id]);
      v = await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 2, contact: null, eventIds: [] }, key()); assert.equal(v.contact, undefined); assert.deepEqual(v.eventIds, []);
    });
    await t.test("event associations cannot cross weddings; removed-event history is preserved", async () => {
      const f = await fixture(), b = await fixture(), e = await event(f), foreign = await event(b);
      await assert.rejects(saveVendor(f.user, f.wedding.id, null, { ...input, eventIds: [foreign.id] }, key()), { code: "EVENT_UNAVAILABLE" });
      const eventBefore = await db.collection("events").findOne({ _id: new ObjectId(e.id) });
      let v = await saveVendor(f.user, f.wedding.id, null, { ...input, eventIds: [e.id] }, key());
      assert.deepEqual(await db.collection("events").findOne({ _id: new ObjectId(e.id) }), eventBefore);
      await db.collection("events").updateOne({ _id: new ObjectId(e.id) }, { $set: { status: "removed" } });
      v = await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 1, eventIds: [e.id], notes: "Retain history" }, key()); assert.equal(v.events[0].available, false);
      assert.equal((await vendorEventChoices(f.user, f.wedding.id)).length, 0);
      await assert.rejects(saveVendor(f.user, f.wedding.id, null, { ...input, eventIds: [e.id] }, key()), { code: "EVENT_UNAVAILABLE" });
      assert.equal(await vendorFor(b.user, b.wedding.id, v.id), null); await assert.rejects(listVendors(b.user, f.wedding.id), { status: 404 });
    });
    await t.test("literal search, event/category/status filters and scoped pagination", async () => {
      const f = await fixture(), e = await event(f);
      for (const name of ["A", "A", "B", ".* literal"]) await saveVendor(f.user, f.wedding.id, null, { ...input, name, ...(name === "B" ? { category: "venue", eventIds: [e.id], contact: { person: "Coordinator" } } : {}) }, key());
      assert.equal((await listVendors(f.user, f.wedding.id, { q: ".*" })).data.length, 1); assert.equal((await listVendors(f.user, f.wedding.id, { q: "Coordinator" })).data.length, 1);
      assert.equal((await listVendors(f.user, f.wedding.id, { category: "venue", eventId: e.id })).data.length, 1); assert.equal((await listVendors(f.user, f.wedding.id, { eventId: "none" })).data.length, 3);
      const first = await listVendors(f.user, f.wedding.id, { limit: 2 }), second = await listVendors(f.user, f.wedding.id, { limit: 2, cursor: first.pagination.nextCursor }); assert.equal(first.pagination.total, 4); assert.equal(new Set([...first.data, ...second.data].map(v => v.id)).size, 4);
      await assert.rejects(listVendors(f.user, f.wedding.id, { cursor: first.pagination.nextCursor, category: "venue" }), { code: "INVALID_CURSOR" });
    });
    await t.test("vendor removal retains historical expense references and spending totals", async () => {
      const f = await fixture(), v = await saveVendor(f.user, f.wedding.id, null, input, key());
      const expense = await saveExpense(f.user, f.wedding.id, null, { title: "Actual charge", amountMinor: "10000", currency: "INR", expenseDate: "2027-01-01T00:00:00Z", category: "food" }, key());
      // Future-link compatibility is asserted in isolation, not exposed as an implemented expense UI.
      await db.collection("expenses").updateOne({ _id: new ObjectId(expense.id) }, { $set: { vendorId: new ObjectId(v.id) } });
      const before = await db.collection("expenses").findOne({ _id: new ObjectId(expense.id) }); await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 1 }, key(), true);
      assert.deepEqual(await db.collection("expenses").findOne({ _id: new ObjectId(expense.id) }), before); assert.equal((await expenseSummary(f.user, f.wedding.id)).totalSpentMinor, "10000"); assert.equal((await listVendors(f.user, f.wedding.id)).data.length, 0);
      assert.equal((await listVendors(f.user, f.wedding.id, { status: "removed" })).data[0].id, v.id);
    });
    await t.test("archive, removed membership, credentials and verification also protect retries", async () => {
      const f = await fixture(), k = key(), v = await saveVendor(f.user, f.wedding.id, null, input, k);
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } }); assert.equal((await saveVendor(f.user, f.wedding.id, null, input, k)).id, v.id);
      for (const mode of ["create", "update", "remove"]) await assert.rejects(saveVendor(f.user, f.wedding.id, mode === "create" ? null : v.id, mode === "create" ? input : { expectedVersion: 1, ...(mode === "update" ? { notes: "Change" } : {}) }, key(), mode === "remove"), { code: "WEDDING_ARCHIVED" });
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "removed" } }); await assert.rejects(saveVendor(f.user, f.wedding.id, null, input, k), { status: 404 });
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "active" } }); await db.collection("users").updateOne({ _id: f.user._id }, { $inc: { credentialVersion: 1 } }); await assert.rejects(vendorFor(f.user, f.wedding.id, v.id), { status: 403 });
      const b = await fixture(); await db.collection("users").updateOne({ _id: b.user._id }, { $unset: { emailVerifiedAt: "" } }); await assert.rejects(saveVendor(b.user, b.wedding.id, null, input, key()), { status: 403 });
    });
    await t.test("HTTP enforces organizer session, CSRF/origin, validation and private caching", async () => {
      const f = await fixture(), token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: f.user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3001/api/v1/weddings/${f.wedding.id}/vendors`, headers = { Origin: "http://localhost:3001", "Content-Type": "application/json", "X-MMM-CSRF": "1", Cookie: `mmm_session=${token}`, "Idempotency-Key": key() };
      assert.equal((await handleVendors(new NextRequest(url), "list", f.wedding.id)).status, 401);
      assert.equal((await handleVendors(new NextRequest(url, { headers: { Cookie: "mmm_gallery=not-an-organizer" } }), "list", f.wedding.id)).status, 401);
      assert.equal((await handleVendors(new NextRequest(url, { method: "POST", headers: { ...headers, Origin: "https://other.example" }, body: JSON.stringify(input) }), "create", f.wedding.id)).status, 403);
      const created = await handleVendors(new NextRequest(url, { method: "POST", headers, body: JSON.stringify(input) }), "create", f.wedding.id); assert.equal(created.status, 201); assert.match(created.headers.get("cache-control")!, /private, no-store/);
      const v = (await created.json()).data; assert.equal(v.source, "MANUAL");
      assert.equal((await handleVendors(new NextRequest(url, { method: "PATCH", headers, body: JSON.stringify({ expectedVersion: 1, googlePlaceId: "not-allowed" }) }), "update", f.wedding.id, v.id)).status, 422);
    });
  } finally { if (db.databaseName === name && /^mmm_vendors_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase(); await closeDatabase(); }
});
