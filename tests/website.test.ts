import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Long, ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateGallery } from "../src/infrastructure/mongodb/migrations/008-gallery";
import { migrateWebsiteDrafts } from "../src/infrastructure/mongodb/migrations/015-website-drafts";
import { createWedding } from "../src/modules/weddings/service";
import { createEvent, updateEvent } from "../src/modules/events/service";
import { websiteEditor, websitePreview, websiteCoverChoices, websiteDraftsEnabled, saveWebsiteDraft } from "../src/modules/website/service";
import { patchWebsiteSchema } from "../src/modules/website/schema";
import { handleWebsite } from "../src/modules/website/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

test("website draft schema rejects unsupported public fields, invalid dates, contacts and duplicate events", () => {
  const valid = { expectedDraftVersion: 1, draft: { coupleNames: "Test & Only", intro: "", selectedEventIds: [] } };
  assert(patchWebsiteSchema.safeParse(valid).success);
  for (const extra of [{ date: "2027-02-29" }, { date: "" }, { contact: {} }, { contact: { email: "bad" } }, { html: "<script>" }, { slug: "replace" }, { selectedEventIds: ["a".repeat(24), "a".repeat(24)] }]) assert(!patchWebsiteSchema.safeParse({ ...valid, draft: { ...valid.draft, ...extra } }).success);
});
test("website drafts use only an isolated loopback replica", async t => {
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27194/?replicaSet=websiteqa");
  const name = `mmm_website_test_${randomBytes(8).toString("hex")}`; process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex"); process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "websiteqa");
  const key = () => randomBytes(16).toString("hex"), draft = { coupleNames: "Selected names", intro: "Welcome <script>literal</script>", selectedEventIds: [] as string[] };
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`, user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Website QA", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Private wedding", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, key());
    return { user, wedding };
  }
  async function event(f: Awaited<ReturnType<typeof fixture>>, scheduled = true) {
    const e = await createEvent(f.user, f.wedding.id, { name: "Selected celebration", type: "custom", startsAt: "2027-02-10T12:00:00Z", venue: { name: "Venue", address: "Explicit public address" }, description: "Approved description", dressCode: "Festive" }, key());
    if (scheduled) await updateEvent(f.user, f.wedding.id, e.id, { expectedVersion: 1, status: "scheduled" }, key()); return e;
  }
  async function photo(f: Awaited<ReturnType<typeof fixture>>) {
    const now = new Date(), row = { _id: new ObjectId(), weddingId: new ObjectId(f.wedding.id), uploadIntentId: new ObjectId(), purpose: "gallery", provider: "cloudinary", providerAssetId: key(), publicId: "isolated/private", providerVersion: 1, resourceType: "image", format: "jpg", bytes: Long.fromNumber(100), width: 100, height: 100, visibility: "gallery", uploadedBy: { userId: f.user._id }, state: "ready", version: 1, filename: "Synthetic QA photo.jpg", schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("assets").insertOne(row); return row;
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db); await migrateGallery(db);
    await t.test("existing private preview works before activation but saving fails closed", async () => {
      const f = await fixture(); assert.equal(await websiteDraftsEnabled(), false); assert.equal((await websiteEditor(f.user, f.wedding.id)).enabled, false); assert.equal((await websitePreview(f.user, f.wedding.id)).events.length, 0);
      await assert.rejects(saveWebsiteDraft(f.user, f.wedding.id, { draft, expectedDraftVersion: 1 }, key()), { code: "WEBSITE_NOT_READY" });
    });
    await t.test("015 is repeatable and preserves records, other validators, indexes and publication fields", async () => {
      const rows = await db.collection("weddings").find().toArray(), indexes = await db.collection("weddings").indexes(), info = await db.listCollections({ name: "weddings" }, { nameOnly: false }).next();
      await db.collection("weddings").updateOne({ _id: rows[0]._id }, { $set: { "publicPage.draft.unknownLegacyField": "needs review" } });
      await assert.rejects(migrateWebsiteDrafts(db), /Existing wedding data/);
      assert.equal(await websiteDraftsEnabled(), false);
      assert.deepEqual((await db.listCollections({ name: "weddings" }, { nameOnly: false }).next())?.options, info?.options);
      await db.collection("weddings").updateOne({ _id: rows[0]._id }, { $unset: { "publicPage.draft.unknownLegacyField": "" } });
      await migrateWebsiteDrafts(db); await migrateWebsiteDrafts(db); assert(await websiteDraftsEnabled());
      assert.deepEqual(await db.collection("weddings").find().toArray(), rows); assert.deepEqual(await db.collection("weddings").indexes(), indexes);
      const after = await db.listCollections({ name: "weddings" }, { nameOnly: false }).next();
      assert.deepEqual(after?.options?.validator?.$jsonSchema.properties.gallery, info?.options?.validator?.$jsonSchema.properties.gallery);
      await assert.rejects(db.collection("weddings").updateOne({ _id: rows[0]._id }, { $set: { "publicPage.draft.contact": "invalid" } }));
    });
    await t.test("ADMIN/MANAGER explicit selections save without changing wedding details or public state", async () => {
      for (const role of ["ADMIN", "MANAGER"]) {
        const f = await fixture(), e = await event(f), p = await photo(f); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role } });
        const before = await db.collection("weddings").findOne({ _id: new ObjectId(f.wedding.id) });
        const editor = await saveWebsiteDraft(f.user, f.wedding.id, { expectedDraftVersion: 1, draft: { ...draft, date: "2028-02-29", selectedEventIds: [e.id], coverAssetId: p._id.toString(), contact: { name: "Public contact", email: "public@example.test" } } }, key());
        assert.equal(editor.draftVersion, 2); assert.equal(editor.state, "unpublished");
        const after = await db.collection("weddings").findOne({ _id: before!._id }); for (const field of ["couple", "title", "timezone", "currency", "version", "gallery", "storage"]) assert.deepEqual(after![field], before![field]);
        assert.equal(after!.publicPage.slug, before!.publicPage.slug); assert.equal(after!.publicPage.publishedRevision, 0); assert(!after!.publicPage.snapshot);
        const preview = await websitePreview(f.user, f.wedding.id); assert.equal(preview.events[0].id, e.id); assert.equal(preview.coverAssetId, p._id.toString()); assert.equal(preview.contact?.email, "public@example.test");
        const text = JSON.stringify(preview); for (const privateField of ["encryptedSecret", "googlePlaceId", "emailNormalized", "maxGuests", "writeFence", "providerAssetId", "publicId"]) assert(!text.includes(privateField));
      }
    });
    await t.test("foreign, draft and removed references cannot be selected; preview suppresses stale selections", async () => {
      const a = await fixture(), b = await fixture(), ea = await event(a), eb = await event(b), ed = await event(a, false), pb = await photo(b), pa = await photo(a);
      for (const id of [eb.id, ed.id, new ObjectId().toString()]) await assert.rejects(saveWebsiteDraft(a.user, a.wedding.id, { expectedDraftVersion: 1, draft: { ...draft, selectedEventIds: [id] } }, key()), { code: "EVENT_UNAVAILABLE" });
      await assert.rejects(saveWebsiteDraft(a.user, a.wedding.id, { expectedDraftVersion: 1, draft: { ...draft, coverAssetId: pb._id.toString() } }, key()), { code: "COVER_UNAVAILABLE" });
      await saveWebsiteDraft(a.user, a.wedding.id, { expectedDraftVersion: 1, draft: { ...draft, selectedEventIds: [ea.id], coverAssetId: pa._id.toString() } }, key());
      await db.collection("events").updateOne({ _id: new ObjectId(ea.id) }, { $set: { status: "removed" } }); await db.collection("assets").updateOne({ _id: pa._id }, { $set: { state: "delete_pending" } });
      const preview = await websitePreview(a.user, a.wedding.id); assert(preview.selectionChanged); assert.equal(preview.events.length, 0); assert(!preview.coverAssetId);
      const cleared = await saveWebsiteDraft(a.user, a.wedding.id, { expectedDraftVersion: 2, draft }, key()); assert(!cleared.draft.coverAssetId); assert.equal(cleared.draft.selectedEventIds.length, 0);
      await assert.rejects(websitePreview(b.user, a.wedding.id), { status: 404 }); assert.equal((await websiteCoverChoices(a.user, a.wedding.id)).data.some(p => p.id === pb._id.toString()), false);
    });
    await t.test("editing a draft never changes an existing published snapshot/revision", async () => {
      const f = await fixture(), snapshot = { coupleNames: "Published names", intro: "Published intro", events: [] };
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { "publicPage.state": "published", "publicPage.publishedRevision": 3, "publicPage.snapshot": snapshot } });
      await saveWebsiteDraft(f.user, f.wedding.id, { expectedDraftVersion: 1, draft }, key());
      const row = await db.collection("weddings").findOne({ _id: new ObjectId(f.wedding.id) }); assert.deepEqual(row!.publicPage.snapshot, snapshot); assert.equal(row!.publicPage.publishedRevision, 3); assert.equal(row!.publicPage.state, "published"); assert.equal((await websitePreview(f.user, f.wedding.id)).coupleNames, draft.coupleNames);
    });
    await t.test("identical retries create one audit/version; stale or expired retries cannot reapply", async () => {
      const f = await fixture(), k = key(), body = { draft, expectedDraftVersion: 1 };
      const results = await Promise.all([1, 2, 3].map(() => saveWebsiteDraft(f.user, f.wedding.id, body, k))); assert(results.every(r => r.draftVersion === 2));
      assert.equal(await db.collection("activity").countDocuments({ weddingId: new ObjectId(f.wedding.id), action: "website.draft.updated" }), 1);
      await assert.rejects(saveWebsiteDraft(f.user, f.wedding.id, { ...body, draft: { ...draft, intro: "different" } }, k), { code: "IDEMPOTENCY_CONFLICT" });
      await db.collection("idempotencyKeys").deleteMany({ resourceId: new ObjectId(f.wedding.id), scopeKey: { $regex: "public-page" } });
      await assert.rejects(saveWebsiteDraft(f.user, f.wedding.id, body, k), { code: "VERSION_CONFLICT" });
      const races = await Promise.allSettled(["A", "B"].map(intro => saveWebsiteDraft(f.user, f.wedding.id, { expectedDraftVersion: 2, draft: { ...draft, intro } }, key()))); assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    });
    await t.test("archive allows reads/reconciliation but blocks new edits; revoked or unverified accounts denied", async () => {
      const f = await fixture(), k = key(), body = { draft, expectedDraftVersion: 1 }; await saveWebsiteDraft(f.user, f.wedding.id, body, k);
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } });
      assert.equal((await websitePreview(f.user, f.wedding.id)).coupleNames, draft.coupleNames); await saveWebsiteDraft(f.user, f.wedding.id, body, k);
      await assert.rejects(saveWebsiteDraft(f.user, f.wedding.id, { draft, expectedDraftVersion: 2 }, key()), { code: "WEDDING_ARCHIVED" });
      await db.collection("users").updateOne({ _id: f.user._id }, { $unset: { emailVerifiedAt: "" } }); await assert.rejects(websitePreview(f.user, f.wedding.id));
      await db.collection("users").updateOne({ _id: f.user._id }, { $set: { emailVerifiedAt: new Date() } }); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "removed" } }); await assert.rejects(saveWebsiteDraft(f.user, f.wedding.id, body, k));
    });
    await t.test("cover choices paginate within the wedding and do not return provider identifiers", async () => {
      const f = await fixture(); for (let i = 0; i < 26; i++) await photo(f);
      const first = await websiteCoverChoices(f.user, f.wedding.id); assert.equal(first.data.length, 24); assert(first.nextCursor); const next = await websiteCoverChoices(f.user, f.wedding.id, first.nextCursor); assert.equal(next.data.length, 2); assert(!next.nextCursor); assert(!first.data.some(p => next.data.some(n => n.id === p.id))); assert.deepEqual(Object.keys(first.data[0]).sort(), ["filename", "id"]);
    });
    await t.test("HTTP requires organizer session/CSRF and returns no-store authenticated preview", async () => {
      const f = await fixture(), token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: f.user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3001/api/v1/weddings/${f.wedding.id}/public-page`, headers = { Origin: "http://localhost:3001", "Content-Type": "application/json", "X-MMM-CSRF": "1", Cookie: `mmm_session=${token}`, "Idempotency-Key": key() };
      assert.equal((await handleWebsite(new NextRequest(url), "preview", f.wedding.id)).status, 401);
      assert.equal((await handleWebsite(new NextRequest(url, { headers: { Cookie: "mmm_gallery=test" } }), "preview", f.wedding.id)).status, 401);
      for (const bad of [{ Origin: "https://other.example" }, { "X-MMM-CSRF": "" }]) assert.equal((await handleWebsite(new NextRequest(url, { method: "PATCH", headers: { ...headers, ...bad }, body: JSON.stringify({ draft, expectedDraftVersion: 1 }) }), "save", f.wedding.id)).status, 403);
      const saved = await handleWebsite(new NextRequest(url, { method: "PATCH", headers, body: JSON.stringify({ draft, expectedDraftVersion: 1 }) }), "save", f.wedding.id); assert.equal(saved.status, 200);
      const preview = await handleWebsite(new NextRequest(url + "/preview", { headers }), "preview", f.wedding.id); assert.equal(preview.status, 200); assert.match(preview.headers.get("cache-control")!, /private, no-store/);
      assert.equal((await handleWebsite(new NextRequest(url + "?cursor=a&cursor=b", { headers }), "read", f.wedding.id)).status, 400);
    });
  } finally { if (db.databaseName === name && /^mmm_website_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase(); await closeDatabase(); }
});
