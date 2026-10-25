import "../scripts/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { createEvent, eventFor, listEvents } from "../src/modules/events/service";
import { createEventSchema, localEventInstant } from "../src/modules/events/schema";
import { createWedding } from "../src/modules/weddings/service";
import { handleWedding } from "../src/modules/weddings/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

test("event date/time validation and DST disambiguation", () => {
  assert.equal(localEventInstant("2027-02-12", "10:00", "Asia/Kolkata"), "2027-02-12T04:30:00.000Z");
  assert.equal(localEventInstant("2027-02-12", "00:00", "Asia/Kolkata"), "2027-02-11T18:30:00.000Z");
  assert.equal(localEventInstant("2028-02-29", "12:00", "UTC"), "2028-02-29T12:00:00.000Z");
  assert.throws(() => localEventInstant("2027-02-29", "12:00", "UTC"));
  assert.throws(() => localEventInstant("2027-03-14", "02:30", "America/New_York"), /does not exist/);
  assert.throws(() => localEventInstant("2027-11-07", "01:30", "America/New_York"), /occurs twice/);
  assert.equal(localEventInstant("2027-11-07", "03:30", "America/New_York"), "2027-11-07T08:30:00.000Z");
  assert.throws(() => localEventInstant("2027-02-12", "25:00", "UTC"));
});

test("event persistence and authorization in an explicitly isolated database", async (t) => {
  const previous = process.env.MONGODB_DB_NAME;
  const testDatabase = `mmm_events_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = testDatabase;
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.APP_ORIGIN = "http://localhost:3001";
  const db = await getDatabase();
  assert.equal(db.databaseName, testDatabase);
  const base = { name: "Haldi ceremony", type: "haldi", startsAt: "2027-02-12T04:30:00Z", venue: { name: "Courtyard", address: "Test venue address" }, status: "draft" };
  async function fixture() {
    const now = new Date();
    const user: User = { _id: new ObjectId(), email: `${randomBytes(8).toString("hex")}@example.test`, emailNormalized: randomBytes(8).toString("hex"), displayName: "Event test organizer", passwordHash: "not-used", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection<User>("users").insertOne(user);
    const wedding = await createWedding(user, { couple: { brideName: "Test Bride", groomName: "Test Groom" }, title: "Event Test", timezone: "Asia/Kolkata", currency: "INR" }, randomBytes(16).toString("hex"));
    return { user, wedding };
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db);
    await t.test("missing migration is explicit and does not silently create event collections", async () => {
      const { user, wedding } = await fixture();
      await assert.rejects(listEvents(user, wedding.id), { code: "EVENTS_UNAVAILABLE" });
      assert.equal(await db.listCollections({ name: "events" }).hasNext(), false);
    });
    await migrateEvents(db); await migrateEvents(db);
    await t.test("strict draft contract and chronology reject unsupported data", () => {
      for (const value of [{ ...base, status: "scheduled" }, { ...base, startsAt: "2027-02-12T10:00:00" }, { ...base, endsAt: base.startsAt }, { ...base, venue: { ...base.venue, mapUrl: "javascript:alert(1)" } }, { ...base, venue: { ...base.venue, mapUrl: "https://user:password@example.test/" } }, { ...base, weddingId: new ObjectId().toString() }]) assert.equal(createEventSchema.safeParse(value).success, false);
      assert.equal(createEventSchema.safeParse({ ...base, endsAt: "2027-02-13T04:30:00+00:00" }).success, true);
      assert.equal(createEventSchema.parse({ ...base, venue: { ...base.venue, mapUrl: " HTTPS://MAPS.GOOGLE.COM " } }).venue.mapUrl, "https://maps.google.com/");
    });
    await t.test("ADMIN/MANAGER create private drafts with audit; no publication or guest/email effects", async () => {
      const { user, wedding } = await fixture();
      await db.collection("memberships").updateOne({ userId: user._id }, { $set: { role: "MANAGER" } });
      const before = await db.collection("weddings").findOne({ _id: new ObjectId(wedding.id) });
      const event = await createEvent(user, wedding.id, base, "manager-event-create-001", "Asia/Kolkata");
      assert.equal(event.status, "draft"); assert.equal(event.startsAt, "2027-02-12T04:30:00.000Z");
      const stored = await db.collection("events").findOne({ _id: new ObjectId(event.id) });
      assert(stored!.startsAt instanceof Date); assert.deepEqual(stored!.schedule, []);
      const after = await db.collection("weddings").findOne({ _id: new ObjectId(wedding.id) });
      assert.deepEqual(after!.publicPage, before!.publicPage); assert.deepEqual(after!.gallery, before!.gallery);
      assert.equal(await db.collection("activity").countDocuments({ weddingId: new ObjectId(wedding.id), action: "event.created" }), 1);
      assert.equal(await db.collection("deliveries").countDocuments({ weddingId: new ObjectId(wedding.id) }), 0);
      assert.equal("createdBy" in event, false);
      await assert.rejects(createEvent(user, wedding.id, base, "timezone-event-key-001", "America/New_York"), { code: "WEDDING_TIMEZONE_CHANGED" });
    });
    await t.test("lost-response retry and concurrent duplicate submissions create one event and audit", async () => {
      const { user, wedding } = await fixture();
      const results = await Promise.all(Array.from({ length: 4 }, () => createEvent(user, wedding.id, base, "concurrent-event-key-001")));
      assert.equal(new Set(results.map((e) => e.id)).size, 1);
      assert.equal(await db.collection("events").countDocuments({ weddingId: new ObjectId(wedding.id) }), 1);
      assert.equal(await db.collection("activity").countDocuments({ weddingId: new ObjectId(wedding.id), action: "event.created" }), 1);
      await assert.rejects(createEvent(user, wedding.id, { ...base, name: "Changed" }, "concurrent-event-key-001"), { code: "IDEMPOTENCY_CONFLICT" });
    });
    await t.test("tenant isolation, stable chronological pagination and filter-bound cursors", async () => {
      const a = await fixture(), b = await fixture();
      const one = await createEvent(a.user, a.wedding.id, { ...base, startsAt: "2027-02-13T00:00:00Z" }, "chronological-key-0001");
      const two = await createEvent(a.user, a.wedding.id, base, "chronological-key-0002");
      const first = await listEvents(a.user, a.wedding.id, { limit: 1 });
      assert.equal(first.data[0].id, two.id);
      const second = await listEvents(a.user, a.wedding.id, { limit: 1, cursor: first.pagination.nextCursor });
      assert.equal(second.data[0].id, one.id); assert.equal(second.pagination.nextCursor, null);
      await assert.rejects(listEvents(a.user, a.wedding.id, { from: "2027-02-14T00:00:00Z", to: "2027-02-12T00:00:00Z" }), { name: "ZodError" });
      await assert.rejects(listEvents(a.user, a.wedding.id, { cursor: first.pagination.nextCursor, status: "draft" }), { code: "INVALID_CURSOR" });
      await assert.rejects(eventFor(b.user, a.wedding.id, one.id), { status: 404 });
      assert.equal(await eventFor(b.user, b.wedding.id, one.id), null);
      await assert.rejects(listEvents(b.user, b.wedding.id, { cursor: first.pagination.nextCursor }), { code: "INVALID_CURSOR" });
    });
    await t.test("archive is read-only; removed/stale credentials cannot create or replay", async () => {
      const { user, wedding } = await fixture();
      const event = await createEvent(user, wedding.id, base, "archived-event-key-001");
      await db.collection("weddings").updateOne({ _id: new ObjectId(wedding.id) }, { $set: { state: "archived" } });
      assert.equal((await eventFor(user, wedding.id, event.id))!.id, event.id);
      assert.equal((await createEvent(user, wedding.id, base, "archived-event-key-001")).id, event.id);
      await assert.rejects(createEvent(user, wedding.id, base, "archived-event-key-002"), { code: "WEDDING_ARCHIVED" });
      await db.collection("memberships").updateOne({ userId: user._id }, { $set: { status: "removed" } });
      await assert.rejects(eventFor(user, wedding.id, event.id), { status: 404 });
      await assert.rejects(createEvent(user, wedding.id, base, "archived-event-key-001"), { status: 404 });
      await db.collection("memberships").updateOne({ userId: user._id }, { $set: { status: "active" } });
      await db.collection("users").updateOne({ _id: user._id }, { $inc: { credentialVersion: 1 } });
      await assert.rejects(createEvent(user, wedding.id, base, "archived-event-key-001"), { status: 401 });
    });
    await t.test("HTTP checks origin/session, POST validation, successful save and read", async () => {
      const { user, wedding } = await fixture();
      const url = `http://localhost:3001/api/v1/weddings/${wedding.id}/events`;
      const token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const headers = { Origin: "http://localhost:3001", "Content-Type": "application/json", "X-MMM-CSRF": "1", Cookie: `mmm_session=${token}`, "Idempotency-Key": "http-event-create-0001" };
      const denied = await handleWedding(new NextRequest(url, { method: "POST", headers: { ...headers, Origin: "https://other.example" }, body: JSON.stringify(base) }), "create-event", wedding.id);
      assert.equal(denied.status, 403);
      assert.equal((await handleWedding(new NextRequest(url), "list-events", wedding.id)).status, 401);
      assert.equal((await handleWedding(new NextRequest(url, { method: "POST", headers, body: JSON.stringify({ ...base, status: "scheduled" }) }), "create-event", wedding.id)).status, 422);
      const saved = await handleWedding(new NextRequest(url, { method: "POST", headers, body: JSON.stringify(base) }), "create-event", wedding.id);
      assert.equal(saved.status, 201);
      const { data } = await saved.json();
      const read = await handleWedding(new NextRequest(url + "/" + data.id, { headers: { Cookie: `mmm_session=${token}` } }), "event-detail", wedding.id, data.id);
      assert.equal(read.status, 200); assert.match(read.headers.get("cache-control")!, /no-store/);
    });
  } finally {
    if (db.databaseName === testDatabase && /^mmm_events_test_[a-f0-9]{16}$/.test(testDatabase)) await db.dropDatabase();
    await closeDatabase();
    process.env.MONGODB_DB_NAME = previous;
  }
});
