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
import { migrateHouseholds } from "../src/infrastructure/mongodb/migrations/006-households";
import { createWedding } from "../src/modules/weddings/service";
import { createEvent } from "../src/modules/events/service";
import { saveHousehold, householdFor, listHouseholds, guestTotals, guestEventChoices } from "../src/modules/households/service";
import { createHouseholdSchema, patchHouseholdSchema } from "../src/modules/households/schema";
import { handleWedding } from "../src/modules/weddings/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

test("guest validation rejects invalid groups and partial patches preserve omitted defaults", () => {
  const input = { displayName: "Guest", representative: { name: "Guest" }, maxGuests: 1, invitedEventIds: [new ObjectId().toString()] };
  for (const patch of [{ maxGuests: 0 }, { maxGuests: 1.5 }, { maxGuests: 2147483648 }, { invitedEventIds: [] }, { invitedEventIds: [input.invitedEventIds[0], input.invitedEventIds[0]] }, { representative: { name: "" } }, { representative: { name: "Guest", email: "bad" } }, { representative: { name: "Guest", phone: "abcde" } }, { rsvp: { status: "attending" } }, { status: "removed" }]) assert.equal(createHouseholdSchema.safeParse({ ...input, ...patch }).success, false);
  assert.deepEqual(patchHouseholdSchema.parse({ expectedVersion: 1, notes: null }), { expectedVersion: 1, notes: null });
  assert.equal(patchHouseholdSchema.safeParse({ expectedVersion: 1 }).success, false);
});

test("guest groups in an asserted isolated database, never the configured application database", async t => {
  const previous = process.env.MONGODB_DB_NAME, name = `mmm_households_test_${randomBytes(8).toString("hex")}`;
  assert.notEqual(name, previous);
  process.env.MONGODB_DB_NAME = name;
  process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase();
  assert.equal(db.databaseName, name); assert.match(db.databaseName, /^mmm_households_test_[a-f0-9]{16}$/);
  const key = () => randomBytes(16).toString("hex");
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`;
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Isolated guest organiser", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated Guest Wedding", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, key());
    const event = await createEvent(user, wedding.id, { name: "Haldi", type: "haldi", startsAt: "2027-02-13T04:30:00Z", venue: { name: "Test venue", address: "Test address" } }, key());
    return { user, wedding, event, input: { displayName: "Sharma family", representative: { name: "Priya Sharma", email: " Shared@Example.test ", phone: "+91 98765 43210" }, maxGuests: 4, invitedEventIds: [event.id], notes: "Private dietary notes", side: "bride" as const, tags: ["Family"] } };
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db);
    await t.test("missing migration fails closed without implicitly creating households", async () => {
      const { user, wedding } = await fixture(); await assert.rejects(listHouseholds(user, wedding.id), { code: "GUESTS_UNAVAILABLE" }); assert.equal(await db.listCollections({ name: "households" }).hasNext(), false);
    });
    await migrateHouseholds(db); await migrateHouseholds(db);
    await t.test("ADMIN/MANAGER create private Pending groups, nonunique contacts and one audit", async () => {
      const { user, wedding, input } = await fixture();
      await db.collection("memberships").updateOne({ userId: user._id }, { $set: { role: "MANAGER" } });
      const group = await saveHousehold(user, wedding.id, null, input, key());
      assert.equal(group!.rsvp.status, "pending"); assert.equal(group!.rsvp.attendeeCount, 0); assert.equal(group!.representative.email, "Shared@Example.test");
      const row = await db.collection("households").findOne({ _id: new ObjectId(group!.id) }); assert.equal(row!.representative.emailNormalized, "shared@example.test");
      assert.equal(await db.collection("activity").countDocuments({ entityId: row!._id, action: "household.created" }), 1);
      assert.equal(await db.collection("deliveries").countDocuments({ weddingId: row!.weddingId }), 0);
      assert.equal(await db.listCollections({ name: "capabilityLinks" }).hasNext(), false);
      await saveHousehold(user, wedding.id, null, input, key()); assert.deepEqual(await guestTotals(user, wedding.id), { groups: 2, maximumPeople: 8 });
      assert.doesNotMatch(JSON.stringify(group), /emailNormalized|tokenHash|passwordHash/);
    });
    await t.test("immutable retries and optimistic races do not create duplicates or overwrite", async () => {
      const { user, wedding, input } = await fixture(), saveKey = key();
      const groups = await Promise.all([1, 2, 3].map(() => saveHousehold(user, wedding.id, null, input, saveKey)));
      assert.equal(new Set(groups.map(g => g!.id)).size, 1);
      const group = groups[0]!; await assert.rejects(saveHousehold(user, wedding.id, null, { ...input, maxGuests: 9 }, saveKey), { code: "IDEMPOTENCY_CONFLICT" });
      const updateKey = key(), update = { expectedVersion: 1, maxGuests: 5 };
      const changed = await Promise.all([1, 2].map(() => saveHousehold(user, wedding.id, group.id, update, updateKey))); assert(changed.every(g => g!.version === 2));
      const races = await Promise.allSettled([6, 7].map(maxGuests => saveHousehold(user, wedding.id, group.id, { expectedVersion: 2, maxGuests }, key()))); assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
      await assert.rejects(saveHousehold(user, wedding.id, group.id, { expectedVersion: 1, notes: "stale" }, key()), { code: "VERSION_CONFLICT", currentVersion: 3 });
    });
    await t.test("optional contacts/notes clear while side, tags and RSVP stay intact", async () => {
      const { user, wedding, input } = await fixture(), group = (await saveHousehold(user, wedding.id, null, input, key()))!;
      const changed = (await saveHousehold(user, wedding.id, group.id, { expectedVersion: 1, representative: { name: "New name" }, notes: null }, key()))!;
      assert.equal(changed.representative.email, undefined); assert.equal(changed.representative.phone, undefined); assert.equal(changed.notes, undefined); assert.equal(changed.side, "bride"); assert.deepEqual(changed.tags, ["Family"]); assert.equal(changed.rsvp.status, "pending");
    });
    await t.test("events are scoped and unavailable associations remain visible until explicitly corrected", async () => {
      const a = await fixture(), b = await fixture();
      await assert.rejects(saveHousehold(a.user, a.wedding.id, null, { ...a.input, invitedEventIds: [b.event.id] }, key()), { code: "EVENT_UNAVAILABLE" });
      const group = (await saveHousehold(a.user, a.wedding.id, null, a.input, key()))!;
      await db.collection("events").updateOne({ _id: new ObjectId(a.event.id) }, { $set: { status: "cancelled" } });
      assert.equal((await guestEventChoices(a.user, a.wedding.id)).length, 0); assert.equal((await householdFor(a.user, a.wedding.id, group.id))!.events[0].available, false);
      await assert.rejects(saveHousehold(a.user, a.wedding.id, group.id, { expectedVersion: 1, notes: "New" }, key()), { code: "EVENT_UNAVAILABLE" });
      await db.collection("events").updateOne({ _id: new ObjectId(a.event.id) }, { $set: { status: "scheduled" } });
      assert.equal((await guestEventChoices(a.user, a.wedding.id))[0].status, "scheduled");
    });
    await t.test("search, event filtering and cursor scope have stable duplicate-name pagination", async () => {
      const { user, wedding, input } = await fixture();
      await Promise.all([1, 2, 3].map(() => saveHousehold(user, wedding.id, null, input, key())));
      const first = await listHouseholds(user, wedding.id, { limit: 2, q: "sharma", eventId: input.invitedEventIds[0] }); assert.equal(first.pagination.total, 3); assert.equal(first.data.length, 2);
      const second = await listHouseholds(user, wedding.id, { limit: 2, q: "sharma", eventId: input.invitedEventIds[0], cursor: first.pagination.nextCursor }); assert.equal(second.data.length, 1); assert.equal(second.pagination.total, 3); assert(!first.data.some(g => g.id === second.data[0].id));
      await assert.rejects(listHouseholds(user, wedding.id, { cursor: first.pagination.nextCursor, q: "changed" }), { code: "INVALID_CURSOR" });
      assert.equal((await listHouseholds(user, wedding.id, { q: "98765" })).data.length, 3); assert.equal((await listHouseholds(user, wedding.id, { q: "SHARED@EXAMPLE" })).data.length, 3);
      assert.equal((await listHouseholds(user, wedding.id, { q: ".*" })).data.length, 0); assert.equal((await listHouseholds(user, wedding.id, { rsvpStatus: "attending" })).data.length, 0);
      const noSearch = await listHouseholds(user, wedding.id, { limit: 1 }); assert.equal((await listHouseholds(user, wedding.id, { limit: 1, cursor: noSearch.pagination.nextCursor })).pagination.total, 3);
    });
    await t.test("removal retains history, excludes totals and safely replays without another audit", async () => {
      const { user, wedding, input } = await fixture(), group = (await saveHousehold(user, wedding.id, null, input, key()))!, removeKey = key();
      const removed = await saveHousehold(user, wedding.id, group.id, { expectedVersion: 1 }, removeKey, true); assert.equal(removed!.status, "removed");
      assert.deepEqual(await guestTotals(user, wedding.id), { groups: 0, maximumPeople: 0 }); assert.equal((await listHouseholds(user, wedding.id)).data.length, 0);
      assert.equal((await householdFor(user, wedding.id, group.id))!.notes, input.notes);
      assert.equal((await saveHousehold(user, wedding.id, group.id, { expectedVersion: 1 }, removeKey, true))!.version, 2);
      assert.equal(await db.collection("activity").countDocuments({ entityId: new ObjectId(group.id), action: "household.removed" }), 1);
      await assert.rejects(saveHousehold(user, wedding.id, group.id, { expectedVersion: 2, notes: "change" }, key()), { code: "GUEST_REMOVED" });
    });
    await t.test("archived, removed, stale-credential and foreign-wedding changes cannot commit", async () => {
      const a = await fixture(), b = await fixture(), saveKey = key(), group = (await saveHousehold(a.user, a.wedding.id, null, a.input, saveKey))!;
      assert.equal(await householdFor(b.user, b.wedding.id, group.id), null); await assert.rejects(listHouseholds(b.user, a.wedding.id), { code: "NOT_FOUND" });
      await assert.rejects(saveHousehold({ ...a.user, credentialVersion: 9 }, a.wedding.id, group.id, { expectedVersion: 1, notes: "bad" }, key()), { code: "UNAUTHENTICATED" });
      await db.collection("weddings").updateOne({ _id: new ObjectId(a.wedding.id) }, { $set: { state: "archived" } });
      assert.equal((await listHouseholds(a.user, a.wedding.id)).data.length, 1); assert.equal((await saveHousehold(a.user, a.wedding.id, null, a.input, saveKey))!.id, group.id);
      await assert.rejects(saveHousehold(a.user, a.wedding.id, group.id, { expectedVersion: 1 }, key(), true), { code: "WEDDING_ARCHIVED" });
      await db.collection("memberships").updateOne({ userId: a.user._id }, { $set: { status: "removed" } });
      await assert.rejects(saveHousehold(a.user, a.wedding.id, null, a.input, saveKey), { code: "NOT_FOUND" });
    });
    await t.test("database validates RSVP capacity and API enforces authentication/origin and safe reads", async () => {
      const { user, wedding, input } = await fixture(), group = (await saveHousehold(user, wedding.id, null, input, key()))!;
      await assert.rejects(db.collection("households").updateOne({ _id: new ObjectId(group.id) }, { $set: { "rsvp.status": "attending", "rsvp.attendeeCount": 5 } }), { code: 121 });
      const token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: user._id, tokenHash: digest(token), credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + 60000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const request = new NextRequest(`http://localhost:3001/api/v1/weddings/${wedding.id}/households`, { headers: { Cookie: `mmm_session=${token}` } });
      const response = await handleWedding(request, "list-households", wedding.id); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /no-store/);
      const anonymous = await handleWedding(new NextRequest(request.url), "list-households", wedding.id); assert.equal(anonymous.status, 401);
      const forged = await handleWedding(new NextRequest(request.url, { method: "POST", headers: { Origin: "https://wrong.test" } }), "create-household", wedding.id); assert.equal(forged.status, 403);
      const patch = await handleWedding(new NextRequest(`${request.url}/${group.id}`, { method: "PATCH", headers: { Cookie: `mmm_session=${token}`, Origin: "http://localhost:3001", "X-MMM-CSRF": "1", "Content-Type": "application/json", "Idempotency-Key": key() }, body: JSON.stringify({ expectedVersion: 1, notes: "A".repeat(10000) }) }), "update-household", wedding.id, group.id); assert.equal(patch.status, 200);
    });
  } finally {
    if (db.databaseName === name && /^mmm_households_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase();
    await closeDatabase(); if (previous === undefined) delete process.env.MONGODB_DB_NAME; else process.env.MONGODB_DB_NAME = previous;
  }
});
