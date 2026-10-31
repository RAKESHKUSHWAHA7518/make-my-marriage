import "../scripts/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Long, ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateHouseholds } from "../src/infrastructure/mongodb/migrations/006-households";
import { migrateHouseholdAccess } from "../src/infrastructure/mongodb/migrations/007-household-access";
import { migrateGallery } from "../src/infrastructure/mongodb/migrations/008-gallery";
import { migrateGalleryAccess } from "../src/infrastructure/mongodb/migrations/009-gallery-access";
import { migrateGuestUploads } from "../src/infrastructure/mongodb/migrations/010-guest-uploads";
import { createWedding } from "../src/modules/weddings/service";
import { createUpload, completeUpload, uploadFor, listGallery, reconcileMedia } from "../src/modules/media/service";
import { exchangeGallery, gallerySettings, manageGallery, guestUploadActor, guestGallery } from "../src/modules/media/gallery-access";
import { invitationLink, exchangeHousehold } from "../src/modules/guest-access/service";
import { handleMedia } from "../src/modules/media/http";
import type { User } from "../src/modules/identity/service";

test("guest uploads use only an asserted disposable local database and mocked provider", async t => {
  assert.match(process.env.MONGODB_URI ?? "", /^mongodb:\/\/127\.0\.0\.1:27190\//);
  const name = `mmm_guest_uploads_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex"); process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.CLOUDINARY_CLOUD_NAME = "test-only"; process.env.CLOUDINARY_API_KEY = "123"; process.env.CLOUDINARY_API_SECRET = "synthetic-only";
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "gallerysharing");
  const key = () => randomBytes(16).toString("hex"), provider = new Map<string, Record<string, unknown>>(), fetchBefore = globalThis.fetch;
  let onInspect: (() => Promise<void>) | undefined;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/api\.cloudinary\.com\//);
    if (String(url).includes("/destroy")) { provider.delete(new URLSearchParams(String(options?.body)).get("public_id")!); return Response.json({ result: "ok" }); }
    if (onInspect) { const hook = onInspect; onInspect = undefined; await hook(); }
    const id = decodeURIComponent(new URL(String(url)).pathname.split("/authenticated/")[1] ?? "");
    return provider.has(id) ? Response.json(provider.get(id)) : Response.json({}, { status: 404 });
  };
  const input = { purpose: "gallery", filename: "private-name.jpg", contentType: "image/jpeg", sizeBytes: "100" };
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`;
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Guest upload QA", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated wedding", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, key());
    return { user, id: wedding.id };
  }
  async function settings(f: Awaited<ReturnType<typeof fixture>>, patch: { isEnabled?: boolean; guestUploadsEnabled?: boolean }) {
    const current = await gallerySettings(f.user, f.id);
    return manageGallery(f.user, f.id, "settings", { ...patch, expectedVersion: current.version });
  }
  async function shared(f: Awaited<ReturnType<typeof fixture>>) {
    await settings(f, { isEnabled: true });
    const link = (await manageGallery(f.user, f.id, "share"))!;
    const token = await exchangeGallery(new URLSearchParams(new URL(link.url!).hash.slice(1)).get("token")!);
    return { token, actor: await guestUploadActor("gallery", token) };
  }
  function upload(row: NonNullable<Awaited<ReturnType<typeof createUpload>>>, patch: Record<string, unknown> = {}) {
    provider.set(row.upload.fields.public_id, { asset_id: key(), public_id: row.upload.fields.public_id, resource_type: "image", type: "authenticated", format: "jpg", bytes: 75, width: 100, height: 100, version: 1, ...patch });
  }
  const storage = async (id: string) => (await db.collection("weddings").findOne({ _id: new ObjectId(id) }))!.storage;
  async function household(f: Awaited<ReturnType<typeof fixture>>) {
    const now = new Date(), eventId = new ObjectId(), householdId = new ObjectId();
    await db.collection("events").insertOne({ _id: eventId, weddingId: new ObjectId(f.id), name: "Private event", type: "custom", startsAt: now, venue: { name: "Venue", address: "Address" }, schedule: [], status: "scheduled", version: 1, createdBy: f.user._id, schemaVersion: 1, createdAt: now, updatedAt: now });
    await db.collection("households").insertOne({ _id: householdId, weddingId: new ObjectId(f.id), displayName: "Family", representative: { name: "Guest" }, side: "both", tags: [], source: "manual", maxGuests: 2, invitedEventIds: [eventId], rsvp: { status: "pending", attendeeCount: 0, updatedAfterDeadline: false }, status: "active", version: 1, schemaVersion: 1, createdAt: now, updatedAt: now });
    const link = await invitationLink(f.user, f.id, householdId.toString());
    const token = await exchangeHousehold(new URLSearchParams(new URL(link!.url).hash.slice(1)).get("token")!);
    return { actor: await guestUploadActor("household", token), token, householdId, eventId };
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db); await migrateHouseholds(db); await migrateHouseholdAccess(db); await migrateGallery(db); await migrateGalleryAccess(db);
    const before = await fixture();
    const family = (await createUpload(before.user, input, key()))!;
    await t.test("missing 010 fails closed and migration preserves existing intents/defaults", async () => {
      await assert.rejects(settings(before, { isEnabled: true, guestUploadsEnabled: true }), { code: "GUEST_UPLOADS_NOT_READY" });
      await migrateGuestUploads(db); await migrateGuestUploads(db);
      assert.equal((await uploadFor(before.user, family.id)).state, "reserved");
      assert.equal((await gallerySettings(before.user, before.id)).guestUploadsEnabled, false);
      assert.equal(await db.collection("uploadIntents").countDocuments({}), 1);
    });
    await t.test("upload permission is separate and disabling it preserves viewing", async () => {
      const f = await fixture(); await assert.rejects(settings(f, { guestUploadsEnabled: true }), { code: "UPLOADS_REQUIRE_GALLERY" });
      const g = await shared(f); await assert.rejects(createUpload(g.actor, input, key()), { code: "GUEST_UPLOADS_DISABLED" });
      await settings(f, { guestUploadsEnabled: true }); assert.equal((await guestGallery(g.token)).uploadsEnabled, true);
      await settings(f, { guestUploadsEnabled: false }); assert.equal((await guestGallery(g.token)).uploadsEnabled, false);
      await settings(f, { isEnabled: false }); await assert.rejects(guestGallery(g.token), { code: "GALLERY_UNAVAILABLE" });
    });
    await t.test("same save key isolates sessions and concurrent finalization counts once", async () => {
      const f = await fixture(), a = await shared(f), b = await shared(f); await settings(f, { guestUploadsEnabled: true });
      const saveKey = key(), first = (await createUpload(a.actor, input, saveKey))!, second = (await createUpload(b.actor, input, saveKey))!;
      assert.notEqual(first.id, second.id); assert.equal((await createUpload(a.actor, input, saveKey))!.id, first.id);
      await assert.rejects(createUpload(a.actor, { ...input, sizeBytes: "200" }, saveKey), { code: "IDEMPOTENCY_CONFLICT" });
      await assert.rejects(uploadFor(b.actor, first.id), { code: "MEDIA_UNAVAILABLE" });
      upload(first); const result = await Promise.all([1,2,3].map(() => completeUpload(a.actor, first.id))); assert(result.every(row => row!.ready));
      assert.equal(Number((await storage(f.id)).usedBytes), 75); assert.equal(Number((await storage(f.id)).reservedBytes), 100);
      assert.equal(await db.collection("activity").countDocuments({ weddingId: new ObjectId(f.id), action: "media.ready" }), 1);
      const data = await guestGallery(a.token); assert.equal(data.photos.length, 1); assert.doesNotMatch(JSON.stringify(data), /private-name|filename|provider|capability|storage/);
      await settings(f, { guestUploadsEnabled: false }); assert.equal((await completeUpload(a.actor, first.id))!.ready, true);
    });
    await t.test("quota races across guests cannot over-reserve", async () => {
      const f = await fixture(), g = await shared(f); await settings(f, { guestUploadsEnabled: true });
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.id) }, { $set: { "storage.limitBytes": Long.fromNumber(100) } });
      const results = await Promise.allSettled([1,2,3].map(() => createUpload(g.actor, input, key())));
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(Number((await storage(f.id)).reservedBytes), 100);
    });
    await t.test("revocation during provider verification prevents publication", async () => {
      for (const change of ["uploads", "gallery", "rotation", "archive", "logout", "expiry"]) {
        const f = await fixture(), g = await shared(f); await settings(f, { guestUploadsEnabled: true });
        const row = (await createUpload(g.actor, input, key()))!; upload(row);
        onInspect = async () => {
          if (change === "uploads") await settings(f, { guestUploadsEnabled: false });
          if (change === "gallery") await settings(f, { isEnabled: false });
          if (change === "rotation") { const s = await gallerySettings(f.user, f.id); await manageGallery(f.user, f.id, "rotate", { expectedVersion: s.version, expectedTokenVersion: s.tokenVersion }, key()); }
          if (change === "archive") await db.collection("weddings").updateOne({ _id: new ObjectId(f.id) }, { $set: { state: "archived" } });
          if (change === "logout" || change === "expiry") await db.collection("capabilitySessions").updateOne({ _id: g.actor._id }, { $set: change === "logout" ? { revokedAt: new Date() } : { expiresAt: new Date(0) } });
        };
        await assert.rejects(completeUpload(g.actor, row.id)); assert.equal(Number((await storage(f.id)).usedBytes), 0);
        assert.equal((await listGallery(f.user)).count, 0);
      }
    });
    await t.test("household uploads recheck removal, eligible events and grant replacement", async () => {
      for (const change of ["remove", "events", "replace"]) {
        const f = await fixture(); await settings(f, { isEnabled: true, guestUploadsEnabled: true }); const h = await household(f);
        const row = (await createUpload(h.actor, input, key()))!; upload(row);
        onInspect = async () => {
          if (change === "remove") await db.collection("households").updateOne({ _id: h.householdId }, { $set: { status: "removed" } });
          if (change === "events") await db.collection("events").updateOne({ _id: h.eventId }, { $set: { status: "cancelled" } });
          if (change === "replace") await invitationLink(f.user, f.id, h.householdId.toString(), { payload: { expectedLinkVersion: 1 }, key: key() });
        };
        await assert.rejects(completeUpload(h.actor, row.id)); assert.equal((await listGallery(f.user)).count, 0);
      }
      const f = await fixture(); await settings(f, { isEnabled: true, guestUploadsEnabled: true }); const h = await household(f);
      const row = (await createUpload(h.actor, input, key()))!; upload(row);
      const s = await gallerySettings(f.user, f.id); await manageGallery(f.user, f.id, "rotate", { expectedVersion: s.version, expectedTokenVersion: s.tokenVersion }, key());
      assert.equal((await completeUpload(h.actor, row.id))!.ready, true);
    });
    await t.test("archive permits ADMIN to disable uploads, never enable them", async () => {
      const f = await fixture(); await settings(f, { isEnabled: true, guestUploadsEnabled: true });
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.id) }, { $set: { state: "archived" } });
      await settings(f, { guestUploadsEnabled: false }); await assert.rejects(settings(f, { guestUploadsEnabled: true }), { code: "WEDDING_ARCHIVED" });
    });
    await t.test("rejected guest uploads and late files use existing cleanup accounting", async () => {
      const f = await fixture(), g = await shared(f); await settings(f, { guestUploadsEnabled: true });
      const row = (await createUpload(g.actor, input, key()))!; upload(row, { format: "svg" });
      await assert.rejects(completeUpload(g.actor, row.id), { code: "PHOTO_REJECTED" }); assert.equal(Number((await storage(f.id)).reservedBytes), 0);
      await reconcileMedia(); assert.equal(provider.has(row.upload.fields.public_id), false);
      await db.collection("uploadIntents").updateMany({ state: "reserved" }, { $set: { expiresAt: new Date(0), nextCheckAt: new Date(0) } });
      for (let n = 0; n < 20; n++) await reconcileMedia();
      assert.equal(await db.collection("uploadIntents").countDocuments({ state: "reserved" }), 0);
    });
    await t.test("guest HTTP uses scoped cookies and cannot remove or forge context", async () => {
      const f = await fixture(), g = await shared(f); await settings(f, { guestUploadsEnabled: true });
      const req = (payload: unknown, headers = {}) => new NextRequest("http://localhost:3001/api/v1/media/intents?audience=guest", { method: "POST", headers: { Cookie: `mmm_gallery=${g.token}`, Origin: "http://localhost:3001", "X-MMM-CSRF": "1", "Content-Type": "application/json", "Idempotency-Key": key(), ...headers }, body: JSON.stringify(payload) });
      const response = await handleMedia(req(input), "create"); assert.equal(response.status, 201); assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal((await handleMedia(req({ ...input, actor: { userId: f.user._id.toString() } }), "create")).status, 422);
      assert.equal((await handleMedia(req(input, { Origin: "https://invalid.example" }), "create")).status, 403);
      assert.equal((await handleMedia(req({ expectedVersion: 1 }), "remove", new ObjectId().toString(), f.id)).status, 403);
      const other = await fixture(), b = await shared(other); await settings(other, { guestUploadsEnabled: true });
      const own = await createUpload(g.actor, input, key()); await assert.rejects(uploadFor(b.actor, own!.id), { code: "MEDIA_UNAVAILABLE" });
    });
  } finally { globalThis.fetch = fetchBefore; if (db.databaseName === name && /^mmm_guest_uploads_[a-f0-9]{16}$/.test(name)) await db.dropDatabase(); await closeDatabase(); }
});
