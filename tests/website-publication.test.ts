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
import { migrateWebsitePublication } from "../src/infrastructure/mongodb/migrations/016-website-publication";
import { createWedding } from "../src/modules/weddings/service";
import { createEvent, updateEvent } from "../src/modules/events/service";
import { saveWebsiteDraft } from "../src/modules/website/service";
import { publicationEnabled, publicationReview, publishWebsite, unpublishWebsite, publicWebsite, publicCoverAsset } from "../src/modules/website/publication";
import { handlePublicWebsite } from "../src/modules/website/public-http";
import { handleWebsite } from "../src/modules/website/http";
import { reconcileMedia } from "../src/modules/media/service";
import type { User } from "../src/modules/identity/service";

test("publication uses an explicitly isolated replica; never configured Atlas", async t => {
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27194/?replicaSet=websiteqa");
  const name = `mmm_publication_test_${randomBytes(8).toString("hex")}`; process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex"); process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.CLOUDINARY_CLOUD_NAME = "isolated-test"; process.env.CLOUDINARY_API_KEY = "123456"; process.env.CLOUDINARY_API_SECRET = "synthetic-provider-secret";
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "websiteqa");
  const key = () => randomBytes(16).toString("hex"), originalFetch = globalThis.fetch;
  const provider = new Map<string, object>(); let lost = false, destroyed = 0, uploadCalls = 0;
  globalThis.fetch = async (url, init) => {
    const path = String(url); assert.match(path, /^https:\/\/(api|res)\.cloudinary\.com\//); assert.equal(init?.redirect, "error");
    if (path.includes("/resources/image/authenticated/")) { const target = decodeURIComponent(path.split("/resources/image/authenticated/")[1]); return provider.has(target) ? Response.json(provider.get(target)) : new Response(null, { status: 404 }); }
    if (path.endsWith("/image/upload")) {
      uploadCalls++; const body = init?.body as URLSearchParams, target = body.get("public_id")!;
      assert.equal(body.get("type"), "authenticated"); assert.equal(body.get("overwrite"), "false"); assert.match(body.get("transformation")!, /f_jpg.*fl_strip_profile/); assert.match(body.get("file")!, /\/gallery\//);
      provider.set(target, { asset_id: key(), public_id: target, resource_type: "image", type: "authenticated", format: "jpg", bytes: 1024, width: 800, height: 600, version: 1 });
      if (lost) { lost = false; throw Error("Provider response lost"); }
      return Response.json({ untrusted: "not used" });
    }
    if (path.endsWith("/destroy")) { destroyed++; return Response.json({ result: "ok" }); }
    if (path.startsWith("https://res.cloudinary.com/")) return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { "Content-Type": "image/jpeg" } });
    throw Error("Unexpected provider call");
  };
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`, user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Publication QA", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Private title", couple: { brideName: "Private bride", groomName: "Private groom" }, timezone: "Asia/Kolkata", currency: "INR" }, key());
    const event = await createEvent(user, wedding.id, { name: "Public ceremony", type: "custom", startsAt: "2027-02-10T12:00:00Z", venue: { name: "Approved venue", address: "Approved address" }, description: "Reviewed description" }, key());
    await updateEvent(user, wedding.id, event.id, { expectedVersion: 1, status: "scheduled" }, key());
    const draft = { coupleNames: "Public names", intro: "Only reviewed introduction", selectedEventIds: [event.id], contact: { email: "public@example.test" } };
    await saveWebsiteDraft(user, wedding.id, { expectedDraftVersion: 1, draft }, key());
    return { user, wedding, event, draft };
  }
  const payload = async (f: Awaited<ReturnType<typeof fixture>>) => { const r = await publicationReview(f.user, f.wedding.id); return { expectedDraftVersion: r.draftVersion, expectedPublishedRevision: r.publishedRevision, expectedReviewHash: r.reviewHash }; };
  async function photo(f: Awaited<ReturnType<typeof fixture>>) {
    const now = new Date(), row = { _id: new ObjectId(), weddingId: new ObjectId(f.wedding.id), uploadIntentId: new ObjectId(), purpose: "gallery", provider: "cloudinary", providerAssetId: key(), publicId: `mmm/${f.wedding.id}/gallery/${key()}`, providerVersion: 1, resourceType: "image", format: "jpg", bytes: Long.fromNumber(100), width: 100, height: 100, visibility: "gallery", uploadedBy: { userId: f.user._id }, state: "ready", version: 1, filename: "private-original.jpg", schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("assets").insertOne(row); await db.collection("weddings").updateOne({ _id: row.weddingId }, { $inc: { "storage.usedBytes": row.bytes } });
    await saveWebsiteDraft(f.user, f.wedding.id, { expectedDraftVersion: 2, draft: { ...f.draft, coverAssetId: row._id.toString() } }, key()); return row;
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db); await migrateGallery(db); await migrateWebsiteDrafts(db);
    await t.test("publishing fails closed until explicit schema/index activation", async () => {
      const f = await fixture(); assert(!await publicationEnabled()); await assert.rejects(publishWebsite(f.user, f.wedding.id, await payload(f), key()), { code: "PUBLICATION_NOT_READY" }); await assert.rejects(publicWebsite((await publicationReview(f.user, f.wedding.id)).slug), { status: 404 });
    });
    await t.test("016 preflights, preserves all records/gallery schema and repeats safely", async () => {
      const rows = await db.collection("weddings").find().toArray(), before = await db.listCollections({ name: "assets" }, { nameOnly: false }).next();
      await migrateWebsitePublication(db); await migrateWebsitePublication(db); assert(await publicationEnabled()); assert.deepEqual(await db.collection("weddings").find().toArray(), rows);
      assert.deepEqual((await db.listCollections({ name: "assets" }, { nameOnly: false }).next())!.options!.validator.$or[0], before!.options!.validator);
      for (const name of ["media_intent", "media_provider", "website_copy_operation"]) assert((await db.collection("assets").indexes()).find(i => i.name === name)?.unique);
    });
    await t.test("publish freezes reviewed content; private edits and fields never leak", async () => {
      const f = await fixture(), r = await publicationReview(f.user, f.wedding.id), before = await db.collection("weddings").findOne({ _id: new ObjectId(f.wedding.id) });
      await publishWebsite(f.user, f.wedding.id, await payload(f), key());
      const result = await publicWebsite(r.slug), raw = JSON.stringify(result);
      assert.equal(result.coupleNames, "Public names"); assert.equal(result.events.length, 1);
      for (const value of ["Private title", "Private bride", "Private groom", "provider", "eventId", "writeFence", "RSVP", f.user.email]) assert(!raw.includes(value));
      await saveWebsiteDraft(f.user, f.wedding.id, { expectedDraftVersion: 2, draft: { ...f.draft, intro: "Private new intro" } }, key()); assert.equal((await publicWebsite(r.slug)).intro, f.draft.intro); assert((await publicationReview(f.user, f.wedding.id)).hasDraftChanges);
      const after = await db.collection("weddings").findOne({ _id: before!._id }); for (const field of ["couple", "title", "currency", "gallery", "version"]) assert.deepEqual(after![field], before![field]);
    });
    await t.test("review binds event content, timezone, draft and current publication revision", async () => {
      const f = await fixture(), body = await payload(f);
      await db.collection("events").updateOne({ _id: new ObjectId(f.event.id) }, { $set: { name: "Changed after review" } }); await assert.rejects(publishWebsite(f.user, f.wedding.id, body, key()), { code: "VERSION_CONFLICT" });
      const next = await payload(f); await publishWebsite(f.user, f.wedding.id, next, key()); await assert.rejects(publishWebsite(f.user, f.wedding.id, next, key()), { code: "VERSION_CONFLICT" });
      await db.collection("events").updateOne({ _id: new ObjectId(f.event.id) }, { $set: { status: "removed" } }); assert.equal((await publicWebsite((await publicationReview(f.user, f.wedding.id)).slug)).events.length, 0); assert(!(await publicationReview(f.user, f.wedding.id)).valid);
    });
    await t.test("concurrent same-key publication reconciles once; expired receipts never republish", async () => {
      const f = await fixture(), body = await payload(f), k = key();
      await Promise.all([1, 2, 3].map(() => publishWebsite(f.user, f.wedding.id, body, k)));
      assert.equal(await db.collection("activity").countDocuments({ weddingId: new ObjectId(f.wedding.id), action: "website.published" }), 1);
      await assert.rejects(publishWebsite(f.user, f.wedding.id, { ...body, expectedReviewHash: "a".repeat(64) }, k), { code: "IDEMPOTENCY_CONFLICT" });
      await db.collection("idempotencyKeys").deleteMany({ resourceId: new ObjectId(f.wedding.id) }); await assert.rejects(publishWebsite(f.user, f.wedding.id, body, k), { code: "VERSION_CONFLICT" });
    });
    await t.test("MANAGER publishes active; archive preserves reads and restricts unpublish to ADMIN", async () => {
      const f = await fixture(); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role: "MANAGER" } });
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { "publicPage.slug": `legacy_${key()}` } });
      const p = await publishWebsite(f.user, f.wedding.id, await payload(f), key()); await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } }); assert.equal((await publicWebsite(p.slug)).coupleNames, "Public names");
      await assert.rejects(publishWebsite(f.user, f.wedding.id, await payload(f), key()), { code: "WEDDING_ARCHIVED" }); await assert.rejects(unpublishWebsite(f.user, f.wedding.id, { expectedPublishedRevision: 1 }, key()), { status: 403 });
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role: "ADMIN" } }); const k = key(); await unpublishWebsite(f.user, f.wedding.id, { expectedPublishedRevision: 1 }, k); await unpublishWebsite(f.user, f.wedding.id, { expectedPublishedRevision: 1 }, k); await assert.rejects(publicWebsite(p.slug), { status: 404 });
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "removed" } }); await assert.rejects(unpublishWebsite(f.user, f.wedding.id, { expectedPublishedRevision: 1 }, k));
    });
    await t.test("lost provider response retains one reserved sanitized target; unpublish revokes and cleans only copies", async () => {
      const f = await fixture(), source = await photo(f), body = await payload(f), k = key(); lost = true;
      await assert.rejects(publishWebsite(f.user, f.wedding.id, body, k), /response lost/);
      const pending = await db.collection("assets").findOne({ weddingId: source.weddingId, purpose: "public_copy" }); assert.equal(pending!.state, "preparing");
      assert.equal((await db.collection("weddings").findOne({ _id: source.weddingId }))!.storage.reservedBytes.toString(), "4000000");
      const count = uploadCalls, p = await publishWebsite(f.user, f.wedding.id, body, k); assert.equal(uploadCalls, count); const site = await publicWebsite(p.slug); assert.notEqual(site.coverAssetId, source._id.toString());
      await assert.rejects(publicCoverAsset(p.slug, source._id.toString()), { status: 404 }); assert.equal((await publicCoverAsset(p.slug, site.coverAssetId!)).purpose, "public_copy");
      const response = await handlePublicWebsite(new NextRequest(`http://localhost:3001/api/public/weddings/${p.slug}/media/${site.coverAssetId}`), p.slug, site.coverAssetId); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); await response.arrayBuffer();
      await unpublishWebsite(f.user, f.wedding.id, { expectedPublishedRevision: 1 }, key()); await assert.rejects(publicCoverAsset(p.slug, site.coverAssetId!), { status: 404 });
      await reconcileMedia(); assert(destroyed > 0); assert.equal((await db.collection("assets").findOne({ _id: source._id }))!.state, "ready");
      const w = await db.collection("weddings").findOne({ _id: source.weddingId }); assert.equal(w!.storage.usedBytes.toString(), "100"); assert.equal(w!.storage.reservedBytes.toString(), "0");
      // A new publication creates a second independent copy, without null-key unique index collisions.
      await publishWebsite(f.user, f.wedding.id, await payload(f), key()); assert.equal(await db.collection("assets").countDocuments({ weddingId: source.weddingId, purpose: "public_copy" }), 2);
    });
    await t.test("abandoned preparations expire and release reservation only after provider cleanup", async () => {
      const f = await fixture(), source = await photo(f); lost = true; await assert.rejects(publishWebsite(f.user, f.wedding.id, await payload(f), key()));
      await db.collection("assets").updateMany({ weddingId: source.weddingId, purpose: "public_copy" }, { $set: { expiresAt: new Date(0), nextCheckAt: new Date(0) } }); await reconcileMedia();
      assert.equal((await db.collection("weddings").findOne({ _id: source.weddingId }))!.storage.reservedBytes.toString(), "0");
    });
    await t.test("foreign weddings and storage exhaustion cannot publish or create provider copies", async () => {
      const a = await fixture(), b = await fixture(); await assert.rejects(publishWebsite(b.user, a.wedding.id, await payload(a), key()), { status: 404 });
      const source = await photo(a); await db.collection("weddings").updateOne({ _id: source.weddingId }, { $set: { "storage.limitBytes": Long.fromNumber(100) } }); const count = uploadCalls;
      await assert.rejects(publishWebsite(a.user, a.wedding.id, await payload(a), key()), { code: "STORAGE_FULL" }); assert.equal(uploadCalls, count); assert.equal(await db.collection("assets").countDocuments({ weddingId: source.weddingId, purpose: "public_copy" }), 0);
    });
    await t.test("unpublish and republish reject old revisions and cannot reactivate through replay", async () => {
      const f = await fixture(), k = key(), body = await payload(f), p = await publishWebsite(f.user, f.wedding.id, body, k);
      const u = await unpublishWebsite(f.user, f.wedding.id, { expectedPublishedRevision: 1 }, key()); assert.equal(u.publishedRevision, 2);
      await publishWebsite(f.user, f.wedding.id, body, k); await assert.rejects(publicWebsite(p.slug), { status: 404 });
      await publishWebsite(f.user, f.wedding.id, await payload(f), key()); await assert.rejects(unpublishWebsite(f.user, f.wedding.id, { expectedPublishedRevision: 1 }, key()), { code: "VERSION_CONFLICT" }); assert.equal((await publicWebsite(p.slug)).coupleNames, "Public names");
    });
    await t.test("HTTP rejects anonymous organizer actions and unknown queries; unavailable output is generic", async () => {
      const f = await fixture(), slug = (await publicationReview(f.user, f.wedding.id)).slug;
      const no = await handlePublicWebsite(new NextRequest(`http://localhost:3001/api/public/weddings/${slug}`), slug); assert.equal(no.status, 404); assert(!JSON.stringify(await no.json()).includes("Public names")); assert.equal(no.headers.get("cache-control"), "no-store");
      assert.equal((await handlePublicWebsite(new NextRequest("http://localhost:3001/api/public/weddings/test?private=true"), "test")).status, 400);
      assert.equal((await handleWebsite(new NextRequest(`http://localhost:3001/api/v1/weddings/${f.wedding.id}/public-page/review`), "review", f.wedding.id)).status, 401);
    });
  } finally { globalThis.fetch = originalFetch; if (db.databaseName === name && /^mmm_publication_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase(); await closeDatabase(); }
});
