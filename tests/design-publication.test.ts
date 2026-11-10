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
import { migrateHouseholdAccess } from "../src/infrastructure/mongodb/migrations/007-household-access";
import { migrateGallery } from "../src/infrastructure/mongodb/migrations/008-gallery";
import { migrateGuestUploads } from "../src/infrastructure/mongodb/migrations/010-guest-uploads";
import { migrateWebsiteDrafts } from "../src/infrastructure/mongodb/migrations/015-website-drafts";
import { migrateWebsitePublication } from "../src/infrastructure/mongodb/migrations/016-website-publication";
import { migrateInvitationDrafts } from "../src/infrastructure/mongodb/migrations/019-invitation-drafts";
import { migrateInvitationPublication } from "../src/infrastructure/mongodb/migrations/020-invitation-publication";
import { createWedding } from "../src/modules/weddings/service";
import { saveHousehold } from "../src/modules/households/service";
import { exchangeHousehold, invitationLink, guestSite } from "../src/modules/guest-access/service";
import { saveDesign, designFor } from "../src/modules/designs/service";
import { publicationEnabled, publicationReview, publishDesign, listVersions, publishedVersion, householdCardChoices, selectHouseholdCard } from "../src/modules/designs/publication";
import { guestCard, guestCardAsset } from "../src/modules/designs/guest";
import { POST as whatsappRoute } from "../src/app/api/v1/weddings/[id]/invitations/whatsapp-preview/route";
import { markWhatsappShared, whatsappPreview } from "../src/modules/guest-access/whatsapp";
import { handlePublication, handleGuestCard } from "../src/modules/designs/publication-http";
import { createUpload, completeUpload, reconcileMedia, assetFor } from "../src/modules/media/service";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";
const input = { name: "Our card", mode: "template", eventIds: [] as string[], draft: { templateKey: "elegant", textFields: { heading: "Join us", coupleNames: "Test & Only", message: "Together", closing: "With love" }, assetIds: [], layout: { palette: "ivory", font: "playfair" } } };
test("invitation publication uses an isolated replica and fake provider only", async t => {
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27197/?replicaSet=designsqa");
  const key = () => randomBytes(16).toString("hex"); process.env.MONGODB_DB_NAME = `mmm_publication_test_${key()}`;
  process.env.APP_ORIGIN = "http://localhost:3011"; process.env.RATE_LIMIT_HMAC_KEY = key() + key(); process.env.CAPABILITY_ENCRYPTION_KEY = key() + key();
  process.env.CLOUDINARY_CLOUD_NAME = "test-only"; process.env.CLOUDINARY_API_KEY = "123"; process.env.CLOUDINARY_API_SECRET = "synthetic-only";
  const db = await getDatabase(); assert.equal((await db.admin().command({ hello: 1 })).setName, "designsqa"); assert.match(db.databaseName, /^mmm_publication_test_[a-f0-9]{32}$/);
  const originalFetch = globalThis.fetch, provider = new Map<string, object>();
  globalThis.fetch = async url => { const request = String(url); assert.match(request, /^https:\/\/api\.cloudinary\.com\//); const id = decodeURIComponent(new URL(request).pathname.split("/authenticated/")[1] ?? ""); return provider.has(id) ? Response.json(provider.get(id)) : Response.json({}, { status: 404 }); };
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`, user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "QA only", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, createdAt: now, updatedAt: now, schemaVersion: 1 };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated publication QA", couple: { brideName: "Test", groomName: "Only" }, currency: "INR", timezone: "Asia/Kolkata" }, key());
    const eid = new ObjectId(); await db.collection("events").insertOne({ _id: eid, weddingId: new ObjectId(wedding.id), name: "Ceremony", type: "wedding", startsAt: now, venue: { name: "Venue", address: "Address" }, schedule: [], status: "scheduled", version: 1, createdBy: user._id, createdAt: now, updatedAt: now, schemaVersion: 1 });
    const household = await saveHousehold(user, wedding.id, null, { displayName: "QA household", representative: { name: "QA" }, maxGuests: 4, invitedEventIds: [eid.toString()] }, key());
    const link = await invitationLink(user, wedding.id, household.id), token = await exchangeHousehold(new URL(link!.url).hash.replace("#token=", ""));
    return { user, wedding, eid, household, token, link };
  }
  async function publish(f: Awaited<ReturnType<typeof fixture>>, eventIds: string[] = []) { const draft = await saveDesign(f.user, f.wedding.id, null, { ...input, eventIds }, key()); const r = await publicationReview(f.user, f.wedding.id, draft.id); const published = await publishDesign(f.user, f.wedding.id, draft.id, { expectedVersion: r.expectedVersion, expectedPublishedVersionId: r.expectedPublishedVersionId, expectedReviewHash: r.expectedReviewHash }, key()); return { draft, published: published! }; }
  try {
    for (const migration of [migrateAccounts, migrateWeddings, migrateEvents, migrateHouseholds, migrateHouseholdAccess, migrateGallery, migrateGuestUploads, migrateWebsiteDrafts, migrateWebsitePublication, migrateInvitationDrafts]) await migration(db);
    assert(!await publicationEnabled());
    await migrateInvitationPublication(db); await migrateInvitationPublication(db); assert(await publicationEnabled());
    await t.test("both roles publish immutable versions; draft edits and later versions do not replace household selection", async () => {
      for (const role of ["ADMIN", "MANAGER"]) {
        const f = await fixture(); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role } });
        const { draft, published } = await publish(f, [f.eid.toString()]);
        const before = await guestSite(f.token), linkBefore = await db.collection("capabilityLinks").findOne({ subjectId: new ObjectId(f.household.id) });
        await selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: published.designVersionId, expectedVersion: f.household.version }, key());
        assert.equal((await guestCard(f.token))!.id, published.designVersionId);
        await saveDesign(f.user, f.wedding.id, draft.id, { name: "Edited private draft", expectedVersion: draft.version }, key());
        const r = await publicationReview(f.user, f.wedding.id, draft.id); await publishDesign(f.user, f.wedding.id, draft.id, { expectedVersion: r.expectedVersion, expectedPublishedVersionId: r.expectedPublishedVersionId, expectedReviewHash: r.expectedReviewHash }, key());
        assert.equal((await guestCard(f.token))!.id, published.designVersionId);
        assert.equal((await publishedVersion(f.user, f.wedding.id, draft.id, published.designVersionId))!.content.name, "Our card");
        assert.equal((await designFor(f.user, f.wedding.id, draft.id))!.published!.revision, 2);
        assert.deepEqual((await guestSite(f.token)).rsvp.status, before.rsvp.status); assert.deepEqual((await guestSite(f.token)).rsvp.attendeeCount, before.rsvp.attendeeCount);
        assert.deepEqual(await db.collection("capabilityLinks").findOne({ _id: linkBefore!._id }), linkBefore);
      }
    });
    await t.test("review binds draft, source events and latest publication; concurrent publishes serialize", async () => {
      const f = await fixture(), d = await saveDesign(f.user, f.wedding.id, null, { ...input, eventIds: [f.eid.toString()] }, key()), r = await publicationReview(f.user, f.wedding.id, d.id), payload = { expectedVersion: r.expectedVersion, expectedPublishedVersionId: r.expectedPublishedVersionId, expectedReviewHash: r.expectedReviewHash };
      await db.collection("events").updateOne({ _id: f.eid }, { $inc: { version: 1 } });
      await assert.rejects(publishDesign(f.user, f.wedding.id, d.id, payload, key()), { code: "VERSION_CONFLICT" });
      const fresh = await publicationReview(f.user, f.wedding.id, d.id), body = { expectedVersion: fresh.expectedVersion, expectedPublishedVersionId: fresh.expectedPublishedVersionId, expectedReviewHash: fresh.expectedReviewHash }, k = key();
      const results = await Promise.all([1, 2, 3].map(() => publishDesign(f.user, f.wedding.id, d.id, body, k))); assert(results.every(r => r!.designVersionId === results[0]!.designVersionId));
      await assert.rejects(publishDesign(f.user, f.wedding.id, d.id, body, key()), { code: "VERSION_CONFLICT" });
      await assert.rejects(publishDesign(f.user, f.wedding.id, d.id, { ...body, expectedVersion: 99 }, k), { code: "IDEMPOTENCY_CONFLICT" });
      await db.collection("idempotencyKeys").deleteMany({}); assert.equal((await publishDesign(f.user, f.wedding.id, d.id, body, k))!.designVersionId, results[0]!.designVersionId);
    });
    await t.test("foreign cards, uninvited events and cancellation never leak; missing card preserves RSVP", async () => {
      const f = await fixture(), other = await fixture(), a = await publish(f, [f.eid.toString()]), foreign = await publish(other);
      await assert.rejects(selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: foreign.published.designVersionId, expectedVersion: f.household.version }, key()), { code: "CARD_INELIGIBLE" });
      const secondEvent = new ObjectId(); const original = await db.collection("events").findOne({ _id: f.eid }); await db.collection("events").insertOne({ ...original, _id: secondEvent });
      const mixed = await publish(f, [f.eid.toString(), secondEvent.toString()]);
      const choices = await householdCardChoices(f.user, f.wedding.id, f.household.id); assert(!choices.data.some(v => v.id === mixed.published.designVersionId));
      await assert.rejects(selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: mixed.published.designVersionId, expectedVersion: f.household.version }, key()), { code: "CARD_INELIGIBLE" });
      await selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: a.published.designVersionId, expectedVersion: f.household.version }, key());
      assert.equal(await guestCard(f.token, foreign.published.designVersionId), null);
      await db.collection("households").updateOne({ _id: new ObjectId(f.household.id) }, { $set: { invitedEventIds: [f.eid, secondEvent] } });
      await db.collection("events").updateOne({ _id: f.eid }, { $set: { status: "cancelled" }, $inc: { version: 1 } }); assert.equal(await guestCard(f.token), null); assert((await guestSite(f.token)).rsvp.editable);
      await db.collection("households").updateOne({ _id: new ObjectId(f.household.id) }, { $set: { status: "removed" } }); await assert.rejects(guestCard(f.token));
    });
    await t.test("selection conflicts do not overwrite RSVP; explicit clearing and archived reads work", async () => {
      const f = await fixture(), a = await publish(f), k = key(), body = { designVersionId: a.published.designVersionId, expectedVersion: f.household.version };
      await selectHouseholdCard(f.user, f.wedding.id, f.household.id, body, k); await selectHouseholdCard(f.user, f.wedding.id, f.household.id, body, k);
      await assert.rejects(selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: null, expectedVersion: f.household.version }, key()), { code: "VERSION_CONFLICT" });
      await selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: null, expectedVersion: f.household.version + 1 }, key()); assert.equal(await guestCard(f.token), null);
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } });
      assert((await listVersions(f.user, f.wedding.id, a.draft.id)).data.length); const r = await publicationReview(f.user, f.wedding.id, a.draft.id);
      await assert.rejects(publishDesign(f.user, f.wedding.id, a.draft.id, { expectedVersion: r.expectedVersion, expectedPublishedVersionId: r.expectedPublishedVersionId, expectedReviewHash: r.expectedReviewHash }, key()), { code: "WEDDING_ARCHIVED" });
      await assert.rejects(selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: null, expectedVersion: f.household.version + 2 }, key()), { code: "WEDDING_ARCHIVED" });
    });
    await t.test("published image references survive draft replacement and cleanup; only selected household can fetch", async () => {
      const f = await fixture(), upload = await createUpload(f.user, { purpose: "invitation", eventIds: [], filename: "card.png", contentType: "image/png", sizeBytes: "100" }, key());
      provider.set(upload!.upload.fields.public_id, { asset_id: key(), public_id: upload!.upload.fields.public_id, type: "authenticated", resource_type: "image", format: "png", bytes: 80, width: 100, height: 150, version: 1 }); const saved = await completeUpload(f.user, upload!.id); assert(saved && "assetId" in saved);
      const d = await saveDesign(f.user, f.wedding.id, null, { name: "Image", mode: "uploaded_image", eventIds: [], draft: { assetIds: [saved.assetId] } }, key()), r = await publicationReview(f.user, f.wedding.id, d.id), v = await publishDesign(f.user, f.wedding.id, d.id, { expectedVersion: r.expectedVersion, expectedPublishedVersionId: r.expectedPublishedVersionId, expectedReviewHash: r.expectedReviewHash }, key());
      await selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: v!.designVersionId, expectedVersion: f.household.version }, key());
      const imageRequest = () => new NextRequest(`http://localhost:3011/api/v1/guest/card?version=${v!.designVersionId}&image=1`, { headers: { Cookie: `mmm_household=${f.token}` } });
      const providerFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => new Response(new Uint8Array([255, 216, 255, 217]), { headers: { "Content-Type": "image/jpeg" } });
        const response = await handleGuestCard(imageRequest()); assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/jpeg"); assert.equal((await response.arrayBuffer()).byteLength, 4); assert.match(response.headers.get("cache-control")!, /no-store/);
        globalThis.fetch = async () => { await db.collection("households").updateOne({ _id: new ObjectId(f.household.id) }, { $unset: { designVersionId: "" } }); return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { "Content-Type": "image/jpeg" } }); };
        assert.equal((await handleGuestCard(imageRequest())).status, 404);
        await db.collection("households").updateOne({ _id: new ObjectId(f.household.id) }, { $set: { designVersionId: new ObjectId(v!.designVersionId) } });
      } finally { globalThis.fetch = providerFetch; }
      await db.collection("designs").deleteOne({ _id: new ObjectId(d.id) }); await db.collection("assets").updateOne({ _id: new ObjectId(saved.assetId) }, { $set: { orphanAfter: new Date(0) } }); await reconcileMedia();
      assert.equal((await assetFor(f.user, saved.assetId!)).state, "ready"); assert.equal((await guestCardAsset(f.token, v!.designVersionId))._id.toString(), saved.assetId); assert.deepEqual((await guestCard(f.token))!.draft, { assetIds: [] });
      const other = await fixture(); await assert.rejects(guestCardAsset(other.token, v!.designVersionId));
      await db.collection("assets").updateOne({ _id: new ObjectId(saved.assetId) }, { $set: { state: "delete_pending" } }); await assert.rejects(guestCardAsset(f.token, v!.designVersionId)); assert((await guestSite(f.token)).rsvp.editable);
    });
    await t.test("private HTTP contracts reject CSRF, unauthenticated/gallery authority, invalid queries and stale credentials", async () => {
      const f = await fixture(), { draft, published } = await publish(f), token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: f.user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3011/api/v1/weddings/${f.wedding.id}/designs/${draft.id}/versions`, headers = { Cookie: `mmm_session=${token}` };
      const response = await handlePublication(new NextRequest(url, { headers }), "versions", f.wedding.id, draft.id); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /no-store/); const dto = JSON.stringify(await response.json()); for (const field of ["operationKey", "requestHash", "publicId", "passwordHash"]) assert(!dto.includes(field));
      assert.equal((await handlePublication(new NextRequest(url), "versions", f.wedding.id, draft.id)).status, 401);
      assert.equal((await handlePublication(new NextRequest(url, { method: "POST", headers: { ...headers, Origin: "https://foreign.example" }, body: "{}" }), "publish", f.wedding.id, draft.id)).status, 403);
      assert.equal((await handlePublication(new NextRequest(url + "?cursor=x&cursor=y", { headers }), "versions", f.wedding.id, draft.id)).status, 400);
      assert.equal((await handleGuestCard(new NextRequest(`http://localhost:3011/api/v1/guest/card?version=${published.designVersionId}`, { headers: { Cookie: "mmm_gallery=not-household" } }))).status, 404);
      await db.collection("users").updateOne({ _id: f.user._id }, { $inc: { credentialVersion: 1 } }); await assert.rejects(listVersions(f.user, f.wedding.id, draft.id), { status: 401 });
    });
    await t.test("version and selection pagination are bounded, signed and scoped; migration preserves populated data", async () => {
      const f = await fixture(), { draft } = await publish(f);
      for (let i = 0; i < 12; i++) { const r = await publicationReview(f.user, f.wedding.id, draft.id); await publishDesign(f.user, f.wedding.id, draft.id, { expectedVersion: r.expectedVersion, expectedPublishedVersionId: r.expectedPublishedVersionId, expectedReviewHash: r.expectedReviewHash }, key()); }
      const page = await listVersions(f.user, f.wedding.id, draft.id); assert.equal(page.data.length, 12); assert(page.nextCursor); const older = await listVersions(f.user, f.wedding.id, draft.id, page.nextCursor!); assert.equal(older.data.length, 1); assert(!page.data.some(v => v.id === older.data[0].id));
      await assert.rejects(listVersions(f.user, f.wedding.id, draft.id, page.nextCursor!.slice(0, -4)), { code: "INVALID_CURSOR" });
      const choices = await householdCardChoices(f.user, f.wedding.id, f.household.id); assert.equal(choices.data.length, 12); assert(choices.nextCursor); const more = await householdCardChoices(f.user, f.wedding.id, f.household.id, choices.nextCursor!); assert.equal(more.data.length, 1);
      await db.collection("households").updateOne({ _id: new ObjectId(f.household.id) }, { $inc: { version: 1 } }); await assert.rejects(householdCardChoices(f.user, f.wedding.id, f.household.id, choices.nextCursor!), { code: "INVALID_CURSOR" });
      const before = await db.collection("designVersions").find().sort({ _id: 1 }).toArray(); await migrateInvitationPublication(db); assert.deepEqual(await db.collection("designVersions").find().sort({ _id: 1 }).toArray(), before);
      await assert.rejects(db.collection("designVersions").insertOne({ ...before[0], _id: new ObjectId(), operationKey: key() + key(), revision: 999, content: { ...before[0].content, eventIds: [new ObjectId().toString()] } }), { code: 121 });
    });
    await t.test("WhatsApp preview is scoped, private and invalidated by link replacement", async () => {
      const f = await fixture(), outsider = await fixture();
      const { published } = await publish(f, [String(f.eid)]);
      await selectHouseholdCard(f.user, f.wedding.id, f.household.id, { designVersionId: published.designVersionId, expectedVersion: f.household.version }, key());
      const input = { householdId: f.household.id };
      const first = await whatsappPreview(f.user, f.wedding.id, input);
      assert(first.message.includes(f.link!.url));
      assert.equal(first.card?.id, published.designVersionId);
      assert.equal(first.events.length, 1);
      assert(!first.markedAt);
      await assert.rejects(whatsappPreview(outsider.user, outsider.wedding.id, input), { status: 404 });
      const raw = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: f.user._id, tokenHash: digest(raw), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3011/api/v1/weddings/${f.wedding.id}/invitations/whatsapp-preview`;
      const call = (origin: string) => whatsappRoute(new NextRequest(url, { method: "POST", body: JSON.stringify(input), headers: {
        Origin: origin, Cookie: `mmm_session=${raw}`, "X-MMM-CSRF": "1", "Content-Type": "application/json",
      } }), { params: Promise.resolve({ id: f.wedding.id }) });
      assert.equal((await call("https://foreign.example")).status, 403);
      const response = await call("http://localhost:3011");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      const replacement = await invitationLink(f.user, f.wedding.id, f.household.id, { payload: { expectedLinkVersion: f.link!.linkVersion }, key: key() });
      await assert.rejects(whatsappPreview(f.user, f.wedding.id, { ...input, expectedReview: first.review }), { code: "REVIEW_CHANGED" });
      assert.equal((await whatsappPreview(f.user, f.wedding.id, input)).url, replacement!.url);
      await db.collection("capabilityLinks").updateOne({ subjectId: new ObjectId(f.household.id) }, { $set: { expiresAt: new Date(0) } });
      await assert.rejects(whatsappPreview(f.user, f.wedding.id, input), { code: "LINK_UNAVAILABLE" });
      const renewed = await invitationLink(f.user, f.wedding.id, f.household.id);
      assert.notEqual(renewed!.url, replacement!.url);
      assert.equal((await whatsappPreview(f.user, f.wedding.id, input)).url, renewed!.url);
      await db.collection("events").updateOne({ _id: f.eid }, { $set: { status: "cancelled" } });
      await assert.rejects(whatsappPreview(f.user, f.wedding.id, input), { code: "NO_ELIGIBLE_EVENTS" });
    });
    await t.test("marking WhatsApp shared records one organizer action without storing the invitation secret", async () => {
      const f = await fixture();
      const preview = await whatsappPreview(f.user, f.wedding.id, { householdId: f.household.id });
      const input = { householdId: f.household.id, expectedReview: preview.review };
      const marks = await Promise.all([markWhatsappShared(f.user, f.wedding.id, input), markWhatsappShared(f.user, f.wedding.id, input)]);
      assert.deepEqual(marks[0], marks[1]);
      assert.equal((await whatsappPreview(f.user, f.wedding.id, { householdId: f.household.id })).markedAt, marks[0]!.markedAt);
      const rows = await db.collection("activity").find({ weddingId: new ObjectId(f.wedding.id), action: "household.whatsapp_marked_shared" }).toArray();
      assert.equal(rows.length, 1);
      assert(!JSON.stringify(rows).includes("#token="));
      assert(!JSON.stringify(rows).includes(preview.review));
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } });
      await assert.rejects(markWhatsappShared(f.user, f.wedding.id, input), { code: "WEDDING_ARCHIVED" });
    });
    assert.equal(await db.collection("emailDeliveries").countDocuments(), 0);
  } finally { globalThis.fetch = originalFetch; await db.dropDatabase(); await closeDatabase(); }
});
