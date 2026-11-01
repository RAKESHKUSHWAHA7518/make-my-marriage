import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { createWedding } from "../src/modules/weddings/service";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";
import { discoverVendors } from "../src/modules/vendors/discovery";
import { handleDiscovery } from "../src/modules/vendors/discovery-http";

test("discovery authorization and persistent limits use only an isolated localhost database", async t => {
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27193/?replicaSet=vendorsqa");
  const name = `mmm_discovery_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex"); process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.GOOGLE_PLACES_API_KEY = "synthetic-test-key"; process.env.GOOGLE_PLACES_TERMS_URL = "https://example.test/terms"; process.env.GOOGLE_PLACES_PRIVACY_URL = "https://example.test/privacy";
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "vendorsqa");
  const original = globalThis.fetch; let calls = 0;
  const place = { id: "Test_place", displayName: { text: "Test business" }, formattedAddress: "Test address", attributions: [] };
  const provider: typeof fetch = async url => { calls++; return Response.json(String(url).includes(":searchText") ? { places: [place], nextPageToken: "opaque-page" } : place); };
  globalThis.fetch = provider;
  const query = { category: "venue", location: "Test city" };
  async function fixture() {
    const now = new Date(), email = `${randomBytes(8).toString("hex")}@example.test`;
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Isolated QA", passwordHash: "unused", credentialVersion: 1, status: "active", emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated discovery QA", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, randomBytes(16).toString("hex"));
    return { user, wedding };
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db);
    await t.test("ADMIN and MANAGER search/details do not create vendors or edit weddings", async () => {
      for (const role of ["ADMIN", "MANAGER"]) {
        const f = await fixture(); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role } });
        const before = await db.collection("weddings").findOne({ _id: new ObjectId(f.wedding.id) });
        assert.equal((await discoverVendors(f.user, f.wedding.id, query)).data instanceof Array, true);
        assert.equal((await discoverVendors(f.user, f.wedding.id, { placeId: place.id }, true)).data instanceof Array, false);
        assert.deepEqual(await db.collection("weddings").findOne({ _id: before!._id }), before);
      }
      assert.equal(await db.listCollections({ name: "vendors" }).hasNext(), false);
    });
    await t.test("wrong wedding, removed access, unverified credentials and archive never call Google", async () => {
      const f = await fixture(), other = await fixture(); const before = calls;
      await assert.rejects(discoverVendors(f.user, other.wedding.id, query), { status: 404 }); assert.equal(calls, before);
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "removed" } });
      await assert.rejects(discoverVendors(f.user, f.wedding.id, query), { status: 404 });
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "active" } });
      await db.collection("users").updateOne({ _id: f.user._id }, { $unset: { emailVerifiedAt: "" } });
      await assert.rejects(discoverVendors(f.user, f.wedding.id, query), { status: 403 });
      await db.collection("users").updateOne({ _id: f.user._id }, { $set: { emailVerifiedAt: new Date() }, $inc: { credentialVersion: 1 } });
      await assert.rejects(discoverVendors(f.user, f.wedding.id, query), { status: 403 });
      await db.collection("weddings").updateOne({ _id: new ObjectId(other.wedding.id) }, { $set: { state: "archived" } });
      await assert.rejects(discoverVendors(other.user, other.wedding.id, query), { code: "WEDDING_ARCHIVED" }); assert.equal(calls, before);
    });
    await t.test("signed cursors bind organizer/wedding/query, expire and stop after three pages", async () => {
      const f = await fixture(), other = await fixture();
      const first = await discoverVendors(f.user, f.wedding.id, query); assert("pagination" in first); const cursor = first.pagination!.nextCursor!;
      const before = calls;
      for (const input of [{ ...query, cursor: cursor + "bad" }, { ...query, cursor, location: "Different city" }, { ...query, cursor, category: "catering" }]) await assert.rejects(discoverVendors(f.user, f.wedding.id, input), { code: "INVALID_CURSOR" });
      await assert.rejects(discoverVendors(other.user, other.wedding.id, { ...query, cursor }), { code: "INVALID_CURSOR" });
      const expired = JSON.parse(Buffer.from(cursor.split(".")[0], "base64url").toString()); expired.expires = Date.now() - 1;
      const body = Buffer.from(JSON.stringify(expired)).toString("base64url"), signature = createHmac("sha256", Buffer.from(process.env.RATE_LIMIT_HMAC_KEY!, "hex")).update(body).digest("base64url");
      await assert.rejects(discoverVendors(f.user, f.wedding.id, { ...query, cursor: `${body}.${signature}` }), { code: "INVALID_CURSOR" }); assert.equal(calls, before);
      const second = await discoverVendors(f.user, f.wedding.id, { ...query, cursor }); assert("pagination" in second);
      const third = await discoverVendors(f.user, f.wedding.id, { ...query, cursor: second.pagination!.nextCursor }); assert("pagination" in third); assert.equal(third.pagination!.nextCursor, null);
    });
    await t.test("revocation during a provider request suppresses its response", async () => {
      const f = await fixture();
      globalThis.fetch = async url => { await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "removed" } }); return provider(url); };
      await assert.rejects(discoverVendors(f.user, f.wedding.id, query), { status: 404 }); globalThis.fetch = provider;
    });
    await t.test("persistent per-user and per-wedding limits prevent provider calls", async () => {
      const f = await fixture(); await discoverVendors(f.user, f.wedding.id, query);
      await db.collection("rateLimits").updateMany({ action: "vendor-discovery-user" }, { $set: { count: 30 } });
      let before = calls; await assert.rejects(discoverVendors(f.user, f.wedding.id, query), { status: 429 }); assert.equal(calls, before);
      const g = await fixture(); await discoverVendors(g.user, g.wedding.id, query);
      await db.collection("rateLimits").updateMany({ action: "vendor-discovery-wedding" }, { $set: { count: 100 } });
      before = calls; await assert.rejects(discoverVendors(g.user, g.wedding.id, query), { status: 429 }); assert.equal(calls, before);
    });
    await t.test("HTTP requires explicit organizer requests, rejects duplicate/extra fields and disables cache", async () => {
      const f = await fixture(), token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: f.user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3001/api/v1/weddings/${f.wedding.id}/vendor-discovery?category=venue&location=Test+city`, headers = { "X-MMM-CSRF": "1", Cookie: `mmm_session=${token}` };
      assert.equal((await handleDiscovery(new NextRequest(url), f.wedding.id)).status, 403);
      assert.equal((await handleDiscovery(new NextRequest(url, { headers: { "X-MMM-CSRF": "1", Cookie: "mmm_gallery=guest" } }), f.wedding.id)).status, 401);
      assert.equal((await handleDiscovery(new NextRequest(url, { headers: { ...headers, Origin: "https://evil.example" } }), f.wedding.id)).status, 403);
      for (const suffix of ["&category=venue", "&fields=*"]) assert.equal((await handleDiscovery(new NextRequest(url + suffix, { headers }), f.wedding.id)).status, 422);
      const response = await handleDiscovery(new NextRequest(url, { headers }), f.wedding.id); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /private, no-store/); assert.equal(response.headers.get("vary"), "Cookie");
      globalThis.fetch = async () => new Response("secret", { status: 429 }); const limited = await handleDiscovery(new NextRequest(url, { headers }), f.wedding.id); assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60"); assert(!JSON.stringify(await limited.json()).includes("secret")); globalThis.fetch = provider;
    });
  } finally { globalThis.fetch = original; if (db.databaseName === name && /^mmm_discovery_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase(); await closeDatabase(); }
});
