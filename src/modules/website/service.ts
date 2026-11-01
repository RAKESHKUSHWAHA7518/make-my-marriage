import "server-only";
import { ObjectId, type Document } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { galleryFamilyAccess } from "@/modules/media/access";
import { patchWebsiteSchema, type WebsiteDraft } from "./schema";

async function access(user: User, weddingId: string) {
  const wedding = await galleryFamilyAccess(user);
  if (wedding._id.toString() !== weddingId) throw new AccountError(404, "NOT_FOUND", "Website unavailable.");
  if (!await (await getDatabase()).collection("users").findOne({ _id: user._id, credentialVersion: user.credentialVersion, status: "active", emailVerifiedAt: { $type: "date" } })) throw new AccountError(403, "FORBIDDEN", "Please use a verified account.");
  return wedding;
}
export async function websiteDraftsEnabled() {
  const info = await (await getDatabase()).listCollections({ name: "weddings" }, { nameOnly: false }).next();
  const d = info?.options?.validator?.$jsonSchema?.properties?.publicPage?.properties?.draft;
  return !!(d?.additionalProperties === false && d.properties?.date && d.properties?.contact && d.properties?.coverAssetId);
}
// Explicit projection: never send raw wedding/publication/provider records to clients.
function draftView(d: Document): WebsiteDraft {
  return { coupleNames: d.coupleNames, intro: d.intro, selectedEventIds: d.selectedEventIds.map((id: ObjectId) => id.toString()), ...(d.date ? { date: d.date } : {}), ...(d.coverAssetId ? { coverAssetId: d.coverAssetId.toString() } : {}), ...(d.contact ? { contact: { ...(d.contact.name ? { name: d.contact.name } : {}), ...(d.contact.email ? { email: d.contact.email } : {}), ...(d.contact.phone ? { phone: d.contact.phone } : {}) } } : {}) };
}
function eventView(e: Document) {
  return { id: e._id.toString(), name: e.name as string, startsAt: e.startsAt.toISOString() as string, ...(e.endsAt ? { endsAt: e.endsAt.toISOString() as string } : {}), venue: { name: e.venue.name as string, address: e.venue.address as string }, ...(e.description ? { description: e.description as string } : {}), ...(e.dressCode ? { dressCode: e.dressCode as string } : {}) };
}
export type WebsiteEvent = ReturnType<typeof eventView>;
export type CoverChoice = { id: string; filename: string };
export async function websiteCoverChoices(user: User, weddingId: string, cursor?: string) {
  const wedding = await access(user, weddingId), db = await getDatabase();
  if (cursor && !/^[a-f0-9]{24}$/.test(cursor)) throw new AccountError(400, "INVALID_CURSOR", "Reload the photo choices.");
  const rows = await db.collection("assets").find({ weddingId: wedding._id, purpose: "gallery", state: "ready", ...(cursor ? { _id: { $lt: new ObjectId(cursor) } } : {}) }, { projection: { filename: 1 } }).sort({ _id: -1 }).limit(25).toArray();
  return { data: rows.slice(0, 24).map(r => ({ id: r._id.toString(), filename: r.filename as string })), nextCursor: rows.length > 24 ? rows[23]._id.toString() : null };
}
export async function websiteEditor(user: User, weddingId: string) {
  const wedding = await access(user, weddingId), db = await getDatabase();
  const [events, covers, enabled] = await Promise.all([
    db.collection("events").find({ weddingId: wedding._id, status: { $in: ["scheduled", "completed"] } }).sort({ startsAt: 1, _id: 1 }).limit(501).toArray(),
    websiteCoverChoices(user, weddingId), websiteDraftsEnabled(),
  ]);
  if (events.length > 500) throw new AccountError(503, "CHOICES_UNAVAILABLE", "Too many events to load. Contact your wedding administrator.");
  const draft = draftView(wedding.publicPage.draft);
  const cover = draft.coverAssetId ? await db.collection("assets").findOne({ _id: new ObjectId(draft.coverAssetId), weddingId: wedding._id, purpose: "gallery", state: "ready" }, { projection: { filename: 1 } }) : null;
  if (cover && !covers.data.some(c => c.id === cover._id.toString())) covers.data.unshift({ id: cover._id.toString(), filename: cover.filename as string });
  return { draft, draftVersion: wedding.publicPage.draftVersion as number, publishedRevision: wedding.publicPage.publishedRevision as number, state: wedding.publicPage.state as "draft" | "published" | "unpublished", slug: wedding.publicPage.slug as string, enabled, events: events.map(eventView), covers };
}
export type WebsiteEditor = Awaited<ReturnType<typeof websiteEditor>>;
export async function websitePreview(user: User, weddingId: string) {
  const wedding = await access(user, weddingId), db = await getDatabase(), draft = draftView(wedding.publicPage.draft);
  const events = await db.collection("events").find({ weddingId: wedding._id, _id: { $in: draft.selectedEventIds.map(id => new ObjectId(id)) }, status: { $in: ["scheduled", "completed"] } }).sort({ startsAt: 1, _id: 1 }).toArray();
  const coverReady = draft.coverAssetId ? !!await db.collection("assets").findOne({ _id: new ObjectId(draft.coverAssetId), weddingId: wedding._id, purpose: "gallery", state: "ready" }, { projection: { _id: 1 } }) : false;
  return { coupleNames: draft.coupleNames, intro: draft.intro, ...(draft.date ? { date: draft.date } : {}), ...(draft.contact ? { contact: draft.contact } : {}), ...(coverReady ? { coverAssetId: draft.coverAssetId } : {}), events: events.map(eventView), timezone: wedding.timezone as string, draftVersion: wedding.publicPage.draftVersion as number, selectionChanged: events.length !== draft.selectedEventIds.length || (!!draft.coverAssetId && !coverReady) };
}
export type WebsitePreview = Awaited<ReturnType<typeof websitePreview>>;
export async function saveWebsiteDraft(user: User, weddingId: string, payload: unknown, key: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid save key is required.");
  const input = patchWebsiteSchema.parse(payload); await access(user, weddingId);
  if (!await websiteDraftsEnabled()) throw new AccountError(503, "WEBSITE_NOT_READY", "Website draft saving is not activated yet.");
  const db = await getDatabase(), scopeKey = `user:${user._id}:wedding:${weddingId}:public-page:draft`, keyHash = digest(key), requestHash = digest(JSON.stringify(input));
  await db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await galleryFamilyAccess(user, session, true);
    if (wedding._id.toString() !== weddingId) throw new AccountError(404, "NOT_FOUND", "Website unavailable.");
    if (!await db.collection("users").findOne({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } }, { session })) throw new AccountError(403, "FORBIDDEN", "Please use a verified account.");
    const previous = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (previous) { if (previous.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This key was used for different changes."); return; }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Website drafts are read-only.");
    if (wedding.publicPage.draftVersion !== input.expectedDraftVersion) throw new AccountError(409, "VERSION_CONFLICT", "The draft changed. Review the latest saved draft before saving again.");
    const ids = input.draft.selectedEventIds.map(id => new ObjectId(id));
    if (await db.collection("events").countDocuments({ _id: { $in: ids }, weddingId: wedding._id, status: { $in: ["scheduled", "completed"] } }, { session }) !== ids.length) throw new AccountError(422, "EVENT_UNAVAILABLE", "Remove unavailable events before saving.");
    if (input.draft.coverAssetId && !await db.collection("assets").findOne({ _id: new ObjectId(input.draft.coverAssetId), weddingId: wedding._id, purpose: "gallery", state: "ready" }, { session })) throw new AccountError(422, "COVER_UNAVAILABLE", "Choose an available photo or no cover photo.");
    const now = new Date(), draft = { ...input.draft, selectedEventIds: ids, ...(input.draft.coverAssetId ? { coverAssetId: new ObjectId(input.draft.coverAssetId) } : {}) };
    await db.collection("weddings").updateOne({ _id: wedding._id }, { $set: { "publicPage.draft": draft, updatedAt: now }, $inc: { "publicPage.draftVersion": 1 } }, { session });
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: "website.draft.updated", entityType: "wedding", entityId: wedding._id, summary: "Website draft updated", beforeVersion: input.expectedDraftVersion, afterVersion: input.expectedDraftVersion + 1, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "wedding", resourceId: wedding._id, responseCode: 200, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
  }, { writeConcern: { w: "majority" } }));
  return websiteEditor(user, weddingId);
}
