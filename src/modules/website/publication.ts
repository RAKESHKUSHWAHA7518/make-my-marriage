import "server-only";
import { randomBytes } from "node:crypto";
import { Long, ObjectId, type ClientSession, type Document } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { preparePublicCover, publicCoverMaxBytes } from "@/infrastructure/cloudinary/provider";
import { AccountError, digest } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { galleryFamilyAccess } from "@/modules/media/access";
import { publishWebsiteSchema, unpublishWebsiteSchema, websiteDraftSchema } from "./schema";

const unavailable = () => new AccountError(404, "WEBSITE_UNAVAILABLE", "This wedding website is unavailable.");
export async function publicationEnabled() {
  const db = await getDatabase(), wedding = await db.listCollections({ name: "weddings" }, { nameOnly: false }).next(), assets = await db.listCollections({ name: "assets" }, { nameOnly: false }).next();
  return !!(wedding?.options?.validator?.$jsonSchema?.properties?.publicPage?.properties?.publishedContentHash && assets?.options?.validator?.$or?.[1] && (await db.collection("assets").indexes()).some(i => i.name === "website_copy_operation"));
}
async function access(user: User, weddingId: string, session?: ClientSession, mutate = false) {
  const w = await galleryFamilyAccess(user, session, mutate), db = await getDatabase();
  if (w._id.toString() !== weddingId) throw unavailable();
  if (!await db.collection("users").findOne({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } }, { session })) throw new AccountError(401, "UNAUTHENTICATED", "Use a verified account.");
  return w;
}
/** Candidate content is constructed afresh under the wedding fence at commit. */
async function candidate(w: Document, session?: ClientSession) {
  const db = await getDatabase(), raw = w.publicPage.draft;
  const draft = websiteDraftSchema.parse({ ...raw, selectedEventIds: raw.selectedEventIds.map((id: ObjectId) => id.toString()), ...(raw.coverAssetId ? { coverAssetId: raw.coverAssetId.toString() } : {}) });
  const events = await db.collection("events").find({ weddingId: w._id, _id: { $in: draft.selectedEventIds.map(id => new ObjectId(id)) }, status: { $in: ["scheduled", "completed"] } }, { session }).sort({ startsAt: 1, _id: 1 }).toArray();
  const cover = raw.coverAssetId ? await db.collection("assets").findOne({ _id: raw.coverAssetId, weddingId: w._id, purpose: "gallery", state: "ready" }, { session }) : null;
  const snapshot = { coupleNames: draft.coupleNames, intro: draft.intro, ...(draft.date ? { date: draft.date } : {}), timezone: w.timezone as string, ...(draft.contact ? { contact: draft.contact } : {}), events: events.map(e => ({ eventId: e._id, title: e.name as string, startsAt: e.startsAt as Date, ...(e.endsAt ? { endsAt: e.endsAt as Date } : {}), venue: { name: e.venue.name as string, address: e.venue.address as string }, ...(e.description ? { description: e.description as string } : {}), ...(e.dressCode ? { dressCode: e.dressCode as string } : {}) })) };
  const hash = digest(JSON.stringify({ snapshot, cover: cover ? { id: cover._id, version: cover.version, providerVersion: cover.providerVersion } : null }));
  return { snapshot, cover, hash, valid: events.length === draft.selectedEventIds.length && (!raw.coverAssetId || !!cover) };
}
function metadata(w: Document) {
  return { state: w.publicPage.state as "draft" | "published" | "unpublished", slug: w.publicPage.slug as string, publishedRevision: w.publicPage.publishedRevision as number, ...(w.publicPage.publishedAt ? { publishedAt: w.publicPage.publishedAt.toISOString() as string } : {}) };
}
export async function publicationReview(user: User, weddingId: string) {
  const w = await access(user, weddingId), c = await candidate(w);
  const s = c.snapshot;
  const preview = { coupleNames: s.coupleNames, intro: s.intro, timezone: s.timezone, ...(s.date ? { date: s.date } : {}), ...(s.contact ? { contact: s.contact } : {}), ...(c.cover ? { coverAssetId: c.cover._id.toString() } : {}), events: s.events.map(e => ({ id: e.eventId.toString(), name: e.title, startsAt: e.startsAt.toISOString(), ...(e.endsAt ? { endsAt: e.endsAt.toISOString() } : {}), venue: e.venue, ...(e.description ? { description: e.description } : {}), ...(e.dressCode ? { dressCode: e.dressCode } : {}) })), draftVersion: w.publicPage.draftVersion as number, selectionChanged: !c.valid };
  return { ...metadata(w), enabled: await publicationEnabled(), draftVersion: w.publicPage.draftVersion as number, reviewHash: c.hash, valid: c.valid, hasDraftChanges: w.publicPage.publishedContentHash !== c.hash, sourceChanged: w.publicPage.sourceChanged as boolean, preview };
}
function operation(user: User, weddingId: string, action: string, input: unknown, key: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid operation key is required.");
  return { scopeKey: `user:${user._id}:wedding:${weddingId}:public-page:${action}`, keyHash: digest(key), requestHash: digest(JSON.stringify(input)) };
}
async function receipt(op: ReturnType<typeof operation>, session?: ClientSession) {
  const previous = await (await getDatabase()).collection("idempotencyKeys").findOne({ scopeKey: op.scopeKey, keyHash: op.keyHash }, { session });
  if (previous && previous.requestHash !== op.requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This operation key belongs to different changes.");
  return !!previous;
}
async function record(user: User, w: Document, action: string, op: ReturnType<typeof operation>, session: ClientSession) {
  const db = await getDatabase(), now = new Date();
  await db.collection("activity").insertOne({ weddingId: w._id, actor: { type: "user", userId: user._id }, action: `website.${action}`, entityType: "wedding", entityId: w._id, summary: action === "published" ? "Wedding website published" : "Wedding website unpublished", occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
  await db.collection("idempotencyKeys").insertOne({ ...op, state: "completed", resourceType: "wedding", resourceId: w._id, responseCode: 200, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
}
function checkPublish(w: Document, input: ReturnType<typeof publishWebsiteSchema.parse>, c: Awaited<ReturnType<typeof candidate>>) {
  if (w.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "Archived weddings cannot be published.");
  if (w.publicPage.draftVersion !== input.expectedDraftVersion || w.publicPage.publishedRevision !== input.expectedPublishedRevision || c.hash !== input.expectedReviewHash) throw new AccountError(409, "VERSION_CONFLICT", "The draft, selected information or publication changed. Review again before publishing.");
  if (!c.valid) throw new AccountError(409, "SELECTION_CHANGED", "A selected event or photo is unavailable. Review your draft.");
}
export async function publishWebsite(user: User, weddingId: string, payload: unknown, key: string | null) {
  const input = publishWebsiteSchema.parse(payload), op = operation(user, weddingId, "publish", input, key), db = await getDatabase();
  const w = await access(user, weddingId);
  if (await receipt(op)) return metadata(w);
  if (!await publicationEnabled()) throw new AccountError(503, "PUBLICATION_NOT_READY", "Website publishing is not activated yet.");
  const c = await candidate(w); checkPublish(w, input, c);
  let copy: Document | null = null, prepared: Awaited<ReturnType<typeof preparePublicCover>> | undefined;
  if (c.cover) {
    const source = c.cover, operationKey = digest(op.scopeKey + op.keyHash);
    copy = await db.client.withSession(session => session.withTransaction(async () => {
      const locked = await access(user, weddingId, session, true); checkPublish(locked, input, await candidate(locked, session));
      const existing = await db.collection("assets").findOne({ weddingId: locked._id, purpose: "public_copy", operationKey }, { session });
      if (existing) {
        if (existing.state !== "preparing" || existing.expiresAt <= new Date()) throw new AccountError(409, "COVER_EXPIRED", "The cover preparation expired. Review before trying again.");
        return existing;
      }
      const reserved = Long.fromNumber(publicCoverMaxBytes), changed = await db.collection("weddings").updateOne({ _id: locked._id, $expr: { $lte: [{ $add: ["$storage.usedBytes", "$storage.reservedBytes", reserved] }, "$storage.limitBytes"] } }, { $inc: { "storage.reservedBytes": reserved } }, { session });
      if (!changed.modifiedCount) throw new AccountError(409, "STORAGE_FULL", "There is not enough storage to prepare a public cover. Choose no cover or free some space.");
      const now = new Date(), row = { _id: new ObjectId(), weddingId: locked._id, purpose: "public_copy", visibility: "public_page", sourceAssetId: source._id, operationKey, publicId: `mmm/${locked._id}/website/${randomBytes(16).toString("hex")}`, reservedBytes: reserved, state: "preparing", expiresAt: new Date(now.getTime() + 15 * 60000), nextCheckAt: new Date(now.getTime() + 15 * 60000), version: 1, schemaVersion: 1, createdAt: now, updatedAt: now };
      await db.collection("assets").insertOne(row, { session }); return row;
    }, { writeConcern: { w: "majority" } })) ?? null;
    if (!copy) throw Error("Cover preparation unavailable");
    prepared = await preparePublicCover({ publicId: source.publicId, providerVersion: source.providerVersion }, copy.publicId);
  }
  await db.client.withSession(session => session.withTransaction(async () => {
    const locked = await access(user, weddingId, session, true);
    if (await receipt(op, session)) return;
    const current = await candidate(locked, session); checkPublish(locked, input, current);
    const now = new Date();
    if (copy && prepared) {
      const reservedCopy = await db.collection("assets").findOne({ _id: copy._id, weddingId: locked._id, state: "preparing", expiresAt: { $gt: now } }, { session });
      if (!reservedCopy) throw new AccountError(409, "COVER_EXPIRED", "Cover preparation expired. Review and retry.");
      await db.collection("assets").updateOne({ _id: copy._id }, { $set: { ...prepared, bytes: Long.fromNumber(prepared.bytes), state: "ready", reservedBytes: Long.ZERO, updatedAt: now }, $inc: { version: 1 } }, { session });
      const changed = await db.collection("weddings").updateOne({ _id: locked._id, "storage.reservedBytes": { $gte: reservedCopy.reservedBytes } }, { $inc: { "storage.reservedBytes": Long.fromValue(reservedCopy.reservedBytes).negate(), "storage.usedBytes": Long.fromNumber(prepared.bytes) } }, { session });
      if (!changed.modifiedCount) throw Error("Cover storage reconciliation required");
    }
    const old = locked.publicPage.snapshot?.publicCoverAssetId;
    if (old) await db.collection("assets").updateOne({ _id: old, weddingId: locked._id, purpose: "public_copy", state: "ready" }, { $set: { state: "delete_pending", nextCheckAt: now, updatedAt: now }, $inc: { version: 1 } }, { session });
    await db.collection("weddings").updateOne({ _id: locked._id }, { $set: { "publicPage.state": "published", "publicPage.snapshot": { ...current.snapshot, ...(copy ? { publicCoverAssetId: copy._id } : {}) }, "publicPage.publishedAt": now, "publicPage.publishedDraftVersion": input.expectedDraftVersion, "publicPage.publishedContentHash": current.hash, "publicPage.sourceChanged": false, updatedAt: now }, $inc: { "publicPage.publishedRevision": 1 } }, { session });
    await record(user, locked, "published", op, session);
  }, { writeConcern: { w: "majority" } }));
  return metadata(await access(user, weddingId));
}
export async function unpublishWebsite(user: User, weddingId: string, payload: unknown, key: string | null) {
  const input = unpublishWebsiteSchema.parse(payload), op = operation(user, weddingId, "unpublish", input, key), db = await getDatabase();
  await access(user, weddingId);
  if (!await publicationEnabled()) throw new AccountError(503, "PUBLICATION_NOT_READY", "Website publishing is not activated yet.");
  await db.client.withSession(session => session.withTransaction(async () => {
    const w = await access(user, weddingId, session, true);
    const member = await db.collection("memberships").findOne({ userId: user._id, weddingId: w._id, status: "active" }, { session });
    if (w.state !== "active" && member?.role !== "ADMIN") throw new AccountError(403, "FORBIDDEN", "Only an administrator can unpublish an archived wedding.");
    if (await receipt(op, session)) return;
    if (w.publicPage.state !== "published" || w.publicPage.publishedRevision !== input.expectedPublishedRevision) throw new AccountError(409, "VERSION_CONFLICT", "Website status changed. Review its current status.");
    const now = new Date(), old = w.publicPage.snapshot?.publicCoverAssetId;
    if (old) await db.collection("assets").updateOne({ _id: old, weddingId: w._id, purpose: "public_copy", state: "ready" }, { $set: { state: "delete_pending", nextCheckAt: now, updatedAt: now }, $inc: { version: 1 } }, { session });
    await db.collection("weddings").updateOne({ _id: w._id }, { $set: { "publicPage.state": "unpublished", updatedAt: now }, $inc: { "publicPage.publishedRevision": 1 } }, { session });
    await record(user, w, "unpublished", op, session);
  }, { writeConcern: { w: "majority" } }));
  return metadata(await access(user, weddingId));
}

/** Public reads never consult draft names/contact or use a raw wedding/event DTO. */
export async function publicWebsite(slug: string) {
  // Existing collision suffixes use base64url and can contain underscores; keep their stable URLs valid.
  if (!/^[a-z0-9][a-z0-9_-]{0,199}$/.test(slug)) throw unavailable();
  const db = await getDatabase(), w = await db.collection("weddings").findOne({ "publicPage.slug": slug, "publicPage.state": "published" }, { projection: { publicPage: 1 } });
  const s = w?.publicPage.snapshot;
  if (!s || !s.timezone || !Array.isArray(s.events)) throw unavailable();
  const rows = await db.collection("events").find({ weddingId: w!._id, _id: { $in: s.events.map((e: Document) => e.eventId) }, status: { $in: ["scheduled", "completed"] } }, { projection: { _id: 1 } }).toArray(), allowed = new Set(rows.map(e => e._id.toString()));
  const cover = s.publicCoverAssetId ? await db.collection("assets").findOne({ _id: s.publicCoverAssetId, weddingId: w!._id, purpose: "public_copy", visibility: "public_page", state: "ready" }, { projection: { _id: 1 } }) : null;
  return { coupleNames: s.coupleNames as string, intro: s.intro as string, timezone: s.timezone as string, ...(s.date ? { date: s.date as string } : {}), ...(cover ? { coverAssetId: cover._id.toString() } : {}), ...(s.contact ? { contact: { ...(s.contact.name ? { name: s.contact.name as string } : {}), ...(s.contact.email ? { email: s.contact.email as string } : {}), ...(s.contact.phone ? { phone: s.contact.phone as string } : {}) } } : {}), events: (s.events as Document[]).filter(e => allowed.has(e.eventId.toString())).map(e => ({ name: e.title as string, startsAt: e.startsAt.toISOString() as string, ...(e.endsAt ? { endsAt: e.endsAt.toISOString() as string } : {}), venue: { name: e.venue.name as string, address: e.venue.address as string }, ...(e.description ? { description: e.description as string } : {}), ...(e.dressCode ? { dressCode: e.dressCode as string } : {}) })) };
}
export type PublicWebsite = Awaited<ReturnType<typeof publicWebsite>>;
export async function publicCoverAsset(slug: string, assetId: string) {
  if (!/^[a-f0-9]{24}$/.test(assetId) || !/^[a-z0-9][a-z0-9_-]{0,199}$/.test(slug)) throw unavailable();
  const db = await getDatabase(), w = await db.collection("weddings").findOne({ "publicPage.slug": slug, "publicPage.state": "published", "publicPage.snapshot.publicCoverAssetId": new ObjectId(assetId) }, { projection: { _id: 1 } });
  if (!w) throw unavailable();
  const asset = await db.collection("assets").findOne({ _id: new ObjectId(assetId), weddingId: w._id, purpose: "public_copy", visibility: "public_page", state: "ready" });
  if (!asset) throw unavailable(); return asset;
}
