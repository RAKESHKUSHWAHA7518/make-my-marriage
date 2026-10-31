import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateVendors } from "../src/infrastructure/mongodb/migrations/012-vendors";
import { migrateGoogleVendors } from "../src/infrastructure/mongodb/migrations/013-google-vendors";
import { createWedding } from "../src/modules/weddings/service";
import { createEvent } from "../src/modules/events/service";
import { googleVendorsEnabled, listVendors, saveVendor, vendorFor } from "../src/modules/vendors/service";
import { createVendorSchema, patchVendorSchema, googleVendorFallbackName } from "../src/modules/vendors/schema";
import { discoverVendors } from "../src/modules/vendors/discovery";
import { handleVendors } from "../src/modules/vendors/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

const input = { source: "GOOGLE_PLACES", googlePlaceId: "Test_place", category: "photography", eventIds: [] };
test("saved Google schema keeps provider display content outside durable records", () => {
  assert.equal(createVendorSchema.safeParse(input).success, true);
  assert.equal(createVendorSchema.safeParse({ ...input, name: "Private family label" }).success, true);
  for (const changes of [{ googlePlaceId: "../bad" }, { rating: 4.9 }, { displayName: "Copied name" }, { formattedAddress: "Copied address" }, { websiteUri: "https://example.test" }, { attributions: [] }, { source: "MANUAL" }]) assert.equal(createVendorSchema.safeParse({ ...input, ...changes }).success, false);
  for (const changes of [{ googlePlaceId: "Another_place" }, { source: "MANUAL" }]) assert.equal(patchVendorSchema.safeParse({ expectedVersion: 1, ...changes }).success, false);
});

test("saved Google vendors use only an asserted disposable localhost database", async t => {
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27193/?replicaSet=vendorsqa");
  const name = `mmm_saved_vendors_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3001"; process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex"); process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "vendorsqa");
  const key = () => randomBytes(16).toString("hex"), originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("Saving must not call a provider"); };
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`;
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Saved vendor QA", passwordHash: "unused", credentialVersion: 1, status: "active", emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated saved vendor QA", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, key()); return { user, wedding };
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db); await migrateVendors(db);
    const original = await fixture(), manual = await saveVendor(original.user, original.wedding.id, null, { source: "MANUAL", name: "Existing manual", category: "venue", eventIds: [] }, key());
    const before = await db.collection("vendors").findOne({ _id: new ObjectId(manual.id) });
    await t.test("missing 013 fails closed for Google while manual vendors remain available", async () => {
      assert.equal(await googleVendorsEnabled(), false); await assert.rejects(saveVendor(original.user, original.wedding.id, null, input, key()), { code: "GOOGLE_VENDOR_SAVE_UNAVAILABLE" }); assert.equal((await listVendors(original.user, original.wedding.id)).data.length, 1);
    });
    await migrateGoogleVendors(db); await migrateGoogleVendors(db);
    await t.test("013 preserves manual records/indexes and adds source-conditional validation/unique place index", async () => {
      assert.deepEqual(await db.collection("vendors").findOne({ _id: before!._id }), before); assert.equal(await googleVendorsEnabled(), true);
      const indexes = await db.collection("vendors").indexes(); assert.equal(indexes.filter(i => i.name?.startsWith("vendors_")).length, 5);
      const index = indexes.find(i => i.name === "vendors_google_place")!; assert.equal(index.unique, true); assert.deepEqual(index.key, { weddingId: 1, googlePlaceId: 1 }); assert.deepEqual(index.partialFilterExpression, { googlePlaceId: { $type: "string" } });
      await assert.rejects(db.collection("vendors").updateOne({ _id: before!._id }, { $set: { googlePlaceId: "Test_place" } }));
      await assert.rejects(db.collection("vendors").updateOne({ _id: before!._id }, { $set: { source: "GOOGLE_PLACES" } }));
      const metadata = await db.listCollections({ name: "vendors" }).next(); assert(metadata && "options" in metadata); assert.equal(metadata.options?.validationLevel, "strict");
    });
    await t.test("ADMIN/MANAGER save only references and independent planning fields without Google credentials", async () => {
      delete process.env.GOOGLE_PLACES_API_KEY;
      for (const role of ["ADMIN", "MANAGER"]) {
        const f = await fixture(); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role } });
        const e = await createEvent(f.user, f.wedding.id, { name: "Test event", type: "haldi", startsAt: "2027-01-01T00:00:00Z", venue: { name: "Test", address: "Test address" } }, key());
        const v = await saveVendor(f.user, f.wedding.id, null, { ...input, eventIds: [e.id], contact: { person: "Independently entered" }, notes: "Private note" }, key());
        assert.equal(v.source, "GOOGLE_PLACES"); assert.equal(v.googlePlaceId, input.googlePlaceId); assert.equal(v.name, googleVendorFallbackName); assert.equal(v.notes, "Private note"); assert.deepEqual(v.eventIds, [e.id]);
        const stored = await db.collection("vendors").findOne({ _id: new ObjectId(v.id) }); assert.equal(stored!.contact.person, "Independently entered");
        for (const field of ["displayName", "formattedAddress", "rating", "websiteUri", "providerData"]) assert.equal(field in stored!, false);
        await assert.rejects(db.collection("vendors").updateOne({ _id: stored!._id }, { $set: { rating: 4.9 } }));
        assert.equal((await listVendors(f.user, f.wedding.id, { source: "GOOGLE_PLACES" })).data[0].id, v.id);
      }
    });
    await t.test("same-key concurrency/receipt expiry reconcile; distinct keys return scoped duplicates", async () => {
      const f = await fixture(), k = key(); const same = await Promise.all([1, 2, 3].map(() => saveVendor(f.user, f.wedding.id, null, input, k))); assert.equal(new Set(same.map(v => v.id)).size, 1);
      await db.collection("idempotencyKeys").deleteMany({ resourceId: new ObjectId(same[0].id) }); assert.equal((await saveVendor(f.user, f.wedding.id, null, input, k)).id, same[0].id);
      const assertDuplicate = (e: unknown) => { const error = e as { code: string; existingVendorId: string }; assert.equal(error.code, "VENDOR_ALREADY_SAVED"); assert.equal(error.existingVendorId, same[0].id); return true; };
      await assert.rejects(saveVendor(f.user, f.wedding.id, null, input, key()), assertDuplicate);
      await assert.rejects(saveVendor(f.user, f.wedding.id, null, { ...input, name: "Different label" }, k), { code: "IDEMPOTENCY_CONFLICT" });
      const other = await fixture(); assert.notEqual((await saveVendor(other.user, other.wedding.id, null, input, key())).id, same[0].id);
      await assert.rejects(saveVendor(other.user, f.wedding.id, null, input, key()), { status: 404 });
      const race = await Promise.allSettled([1, 2, 3].map(() => saveVendor(f.user, f.wedding.id, null, { ...input, googlePlaceId: "Another_place" }, key()))); assert.equal(race.filter(r => r.status === "fulfilled").length, 1); assert(race.filter(r => r.status === "rejected").every(r => r.reason.code === "VENDOR_ALREADY_SAVED"));
      assert.equal(await db.collection("vendors").countDocuments({ weddingId: new ObjectId(f.wedding.id) }), 2);
    });
    await t.test("private edits retain provider identity; removed references cannot be duplicated/resurrected", async () => {
      const f = await fixture(), k = key(), v = await saveVendor(f.user, f.wedding.id, null, input, k);
      const changed = await saveVendor(f.user, f.wedding.id, v.id, { name: "Our photographer", notes: "Updated private note", expectedVersion: 1 }, key()); assert.equal(changed.googlePlaceId, input.googlePlaceId);
      await assert.rejects(saveVendor(f.user, f.wedding.id, v.id, { name: "Stale edit", expectedVersion: 1 }, key()), { code: "VERSION_CONFLICT" });
      const removed = await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 2 }, key(), true); assert.equal(removed.status, "removed");
      assert.equal((await saveVendor(f.user, f.wedding.id, null, input, k)).status, "removed");
      await assert.rejects(saveVendor(f.user, f.wedding.id, null, input, key()), e => { assert.equal((e as { existingVendorStatus: string }).existingVendorStatus, "removed"); return true; });
      assert.equal((await listVendors(f.user, f.wedding.id, { status: "removed", source: "GOOGLE_PLACES", q: "Our photographer" })).data[0].id, v.id);
      await migrateGoogleVendors(db); assert.equal((await vendorFor(f.user, f.wedding.id, v.id))!.googlePlaceId, input.googlePlaceId);
    });
    await t.test("archive/access/credentials and foreign events protect Google saves", async () => {
      const f = await fixture(), other = await fixture();
      const foreign = await createEvent(other.user, other.wedding.id, { name: "Foreign event", type: "haldi", startsAt: "2027-01-01T00:00:00Z", venue: { name: "Test", address: "Test address" } }, key());
      await assert.rejects(saveVendor(f.user, f.wedding.id, null, { ...input, eventIds: [foreign.id] }, key()), { code: "EVENT_UNAVAILABLE" });
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } }); await assert.rejects(saveVendor(f.user, f.wedding.id, null, input, key()), { code: "WEDDING_ARCHIVED" });
      await db.collection("memberships").updateOne({ userId: other.user._id }, { $set: { status: "removed" } }); await assert.rejects(saveVendor(other.user, other.wedding.id, null, input, key()), { status: 404 });
      await db.collection("memberships").updateOne({ userId: other.user._id }, { $set: { status: "active" } }); await db.collection("users").updateOne({ _id: other.user._id }, { $inc: { credentialVersion: 1 } }); await assert.rejects(saveVendor(other.user, other.wedding.id, null, input, key()), { status: 403 });
    });
    await t.test("discovery annotates only this wedding's saved reference, including removed history", async () => {
      const f = await fixture(), other = await fixture(), v = await saveVendor(f.user, f.wedding.id, null, { ...input, notes: "Never in discovery DTO" }, key());
      process.env.GOOGLE_PLACES_API_KEY = "synthetic-test-key"; process.env.GOOGLE_PLACES_TERMS_URL = "https://example.test/terms"; process.env.GOOGLE_PLACES_PRIVACY_URL = "https://example.test/privacy";
      const place = { id: input.googlePlaceId, displayName: { text: "Transient provider name" } };
      globalThis.fetch = async url => Response.json(String(url).includes(":searchText") ? { places: [place] } : place);
      const result = await discoverVendors(f.user, f.wedding.id, { category: "photography", location: "Test city" }); assert(Array.isArray(result.data)); assert.equal(result.data[0].savedVendor?.id, v.id); assert(!JSON.stringify(result).includes("Never in discovery DTO"));
      const foreign = await discoverVendors(other.user, other.wedding.id, { placeId: input.googlePlaceId }, true); assert(!Array.isArray(foreign.data)); assert.equal(foreign.data.savedVendor, undefined);
      await saveVendor(f.user, f.wedding.id, v.id, { expectedVersion: 1 }, key(), true);
      const removed = await discoverVendors(f.user, f.wedding.id, { placeId: input.googlePlaceId }, true); assert(!Array.isArray(removed.data)); assert.equal(removed.data.savedVendor?.status, "removed");
      globalThis.fetch = async () => { throw Error("No provider calls expected"); };
    });
    await t.test("HTTP duplicate responses return only authorized existing IDs; immutable identity rejected", async () => {
      const f = await fixture(), token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: f.user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3001/api/v1/weddings/${f.wedding.id}/vendors`, headers = { Origin: "http://localhost:3001", "X-MMM-CSRF": "1", "Content-Type": "application/json", Cookie: `mmm_session=${token}`, "Idempotency-Key": key() };
      const response = await handleVendors(new NextRequest(url, { method: "POST", headers, body: JSON.stringify(input) }), "create", f.wedding.id); assert.equal(response.status, 201); const v = (await response.json()).data;
      const duplicate = await handleVendors(new NextRequest(url, { method: "POST", headers: { ...headers, "Idempotency-Key": key() }, body: JSON.stringify(input) }), "create", f.wedding.id); assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).error.existingVendorId, v.id);
      const patch = await handleVendors(new NextRequest(url, { method: "PATCH", headers: { ...headers, "Idempotency-Key": key() }, body: JSON.stringify({ googlePlaceId: "Changed", expectedVersion: 1 }) }), "update", f.wedding.id, v.id); assert.equal(patch.status, 422);
    });
  } finally { globalThis.fetch = originalFetch; if (db.databaseName === name && /^mmm_saved_vendors_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase(); await closeDatabase(); }
});
