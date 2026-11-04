import "server-only";
import { ObjectId, type ClientSession, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest, privateKey } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { galleryFamilyAccess } from "@/modules/media/access";
import { createDesignSchema, designId, type DesignInput } from "./schema";

const missing = () => new AccountError(404, "DESIGN_UNAVAILABLE", "Invitation version unavailable.");
async function access(user: User, weddingId: string, session?: ClientSession, mutate = false) {
  const wedding = await galleryFamilyAccess(user, session, mutate);
  if (wedding._id.toString() !== weddingId) throw missing();
  return wedding;
}
export async function publicationEnabled() {
  const db = await getDatabase();
  const info = await db.listCollections({ name: "designVersions" }, { nameOnly: false }).next();
  return !!info?.options?.validator?.$jsonSchema?.properties?.content &&
    (await db.collection("designVersions").indexes()).some(i => i.name === "design_version_operation" && i.unique);
}
async function ready() {
  if (!await publicationEnabled()) throw new AccountError(503, "PUBLICATION_NOT_READY", "Invitation publishing is awaiting activation.");
}
const keyOf = (key: string | null) => {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid save key is required.");
  return digest(key);
};
async function candidate(weddingId: ObjectId, id: string, session?: ClientSession) {
  if (!designId.safeParse(id).success) throw missing();
  const db = await getDatabase(), row = await db.collection("designs").findOne({ _id: new ObjectId(id), weddingId }, { session });
  if (!row) throw missing();
  const content = createDesignSchema.parse({ name: row.name, mode: row.mode, eventIds: row.eventIds.map(String), draft: row.draft });
  const events = await db.collection("events").find({ weddingId, _id: { $in: row.eventIds } }, { session }).sort({ _id: 1 }).toArray();
  const assets = await db.collection("assets").find({ weddingId, _id: { $in: content.draft.assetIds.map(id => new ObjectId(id)) }, purpose: "invitation", visibility: "family", state: "ready" }, { session }).toArray();
  const available = events.length === row.eventIds.length && events.every(e => !["removed", "cancelled"].includes(e.status)) && assets.length === content.draft.assetIds.length && assets.every(a => JSON.stringify(a.audienceEventIds.map(String).sort()) === JSON.stringify([...content.eventIds].sort()));
  const reviewHash = digest(JSON.stringify([row._id, row.version, row.latestPublishedVersionId ?? null, content, events.map(e => [e._id, e.version, e.status]), assets.map(a => [a._id, a.version, a.providerVersion])]));
  return { row, content, available, reviewHash, events: events.map(e => ({ id: e._id.toString(), name: e.name as string, available: !["removed", "cancelled"].includes(e.status), changed: row.eventVersions?.find((v: Document) => v.eventId.equals(e._id))?.version !== e.version })) };
}
export const publishSchema = z.strictObject({ expectedVersion: z.number().int().positive(), expectedPublishedVersionId: designId.nullable(), expectedReviewHash: z.string().regex(/^[a-f0-9]{64}$/) });
export async function publicationReview(user: User, weddingId: string, id: string) {
  const wedding = await access(user, weddingId); await ready();
  const c = await candidate(wedding._id, id);
  return { expectedVersion: c.row.version as number, expectedPublishedVersionId: c.row.latestPublishedVersionId?.toString() ?? null, expectedReviewHash: c.reviewHash, available: c.available, content: c.content, events: c.events };
}
export type PublishedDesign = { id: string; designId: string; revision: number; publishedAt: string; content: DesignInput; imageAvailable: boolean; events: { id: string; name: string; available: boolean }[] };
async function versionView(row: Document): Promise<PublishedDesign> {
  const content = createDesignSchema.parse(row.content), db = await getDatabase();
  const asset = content.mode === "uploaded_image" && await db.collection("assets").findOne({ _id: new ObjectId(content.draft.assetIds[0]), weddingId: row.weddingId, purpose: "invitation", state: "ready", visibility: "family", audienceEventIds: { $size: row.eventIds.length, ...(row.eventIds.length ? { $all: row.eventIds } : {}) } });
  const events = await db.collection("events").find({ weddingId: row.weddingId, _id: { $in: row.eventIds } }, { projection: { name: 1, status: 1 } }).toArray();
  return { id: row._id.toString(), designId: row.designId.toString(), revision: row.revision, publishedAt: row.createdAt.toISOString(), content, imageAvailable: content.mode !== "uploaded_image" || !!asset, events: row.eventIds.map((id: ObjectId) => { const e = events.find(e => e._id.equals(id)); return { id: id.toString(), name: e?.name ?? "Unavailable event", available: !!e && !["removed", "cancelled"].includes(e.status) }; }) };
}
export async function publishedVersion(user: User, weddingId: string, design: string, id: string) {
  const wedding = await access(user, weddingId); await ready();
  if (![design, id].every(v => designId.safeParse(v).success)) return null;
  const row = await (await getDatabase()).collection("designVersions").findOne({ _id: new ObjectId(id), designId: new ObjectId(design), weddingId: wedding._id });
  return row ? versionView(row) : null;
}
export async function listVersions(user: User, weddingId: string, design: string, cursor?: string) {
  const wedding = await access(user, weddingId); await ready();
  if (!designId.safeParse(design).success) throw missing();
  let before: number | undefined;
  if (cursor) {
    try { if (cursor.length > 1500) throw Error(); const c = JSON.parse(Buffer.from(cursor, "base64url").toString()); if (c.scope !== `${user._id}:${weddingId}:${design}` || !Number.isSafeInteger(c.before) || c.before < 1 || c.signature !== privateKey(`design-versions:${c.scope}:${c.before}`)) throw Error(); before = c.before; }
    catch { throw new AccountError(400, "INVALID_CURSOR", "Reload published versions to continue."); }
  }
  const rows = await (await getDatabase()).collection("designVersions").find({ weddingId: wedding._id, designId: new ObjectId(design), ...(before ? { revision: { $lt: before } } : {}) }).sort({ revision: -1 }).limit(13).toArray();
  const last = rows[11], scope = `${user._id}:${weddingId}:${design}`;
  return { data: await Promise.all(rows.slice(0, 12).map(versionView)), nextCursor: rows.length > 12 ? Buffer.from(JSON.stringify({ scope, before: last.revision, signature: privateKey(`design-versions:${scope}:${last.revision}`) })).toString("base64url") : null };
}
export async function publishDesign(user: User, weddingId: string, design: string, payload: unknown, key: string | null) {
  const keyHash = keyOf(key), input = publishSchema.parse(payload), requestHash = digest(JSON.stringify(input));
  if (!designId.safeParse(design).success) throw missing();
  await access(user, weddingId); await ready(); const db = await getDatabase(), operationKey = digest(`${user._id}:${design}:${keyHash}`);
  return db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await access(user, weddingId, session, true);
    const prior = await db.collection("designVersions").findOne({ weddingId: wedding._id, operationKey }, { session });
    if (prior) { if (prior.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This key was used for a different publication."); return { designVersionId: prior._id.toString(), designId: design, revision: prior.revision as number, eventIds: prior.eventIds.map(String) }; }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Publishing is disabled.");
    const c = await candidate(wedding._id, design, session);
    if (c.row.version !== input.expectedVersion || (c.row.latestPublishedVersionId?.toString() ?? null) !== input.expectedPublishedVersionId || c.reviewHash !== input.expectedReviewHash) throw new AccountError(409, "VERSION_CONFLICT", "The draft or its events changed. Reload and review again.");
    if (!c.available) throw new AccountError(422, "DESIGN_NOT_READY", "Review the card. An image or represented event is unavailable.");
    const latest = await db.collection("designVersions").findOne({ weddingId: wedding._id, designId: c.row._id }, { session, sort: { revision: -1 } });
    const _id = new ObjectId(), revision = (latest?.revision ?? 0) + 1, now = new Date();
    await db.collection("designVersions").insertOne({ _id, weddingId: wedding._id, designId: c.row._id, revision, eventIds: c.row.eventIds, content: c.content, publishedBy: user._id, sourceVersion: c.row.version, operationKey, requestHash, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("designs").updateOne({ _id: c.row._id, weddingId: wedding._id }, { $set: { latestPublishedVersionId: _id } }, { session });
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: "design.published", entityType: "design", entityId: c.row._id, summary: "Invitation version published", occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return { designVersionId: _id.toString(), designId: design, revision, eventIds: c.row.eventIds.map(String) as string[] };
  }, { writeConcern: { w: "majority" } }));
}

export const selectionSchema = z.strictObject({ designVersionId: designId.nullable(), expectedVersion: z.number().int().positive() });
/** Every represented event must still be scheduled/completed and invited. Empty scope still needs an eligible event. */
export async function versionEligible(weddingId: ObjectId, household: Document, row: Document, session?: ClientSession) {
  if (household.status !== "active" || !row.weddingId.equals(weddingId)) return false;
  const events = await (await getDatabase()).collection("events").find({ weddingId, _id: { $in: household.invitedEventIds }, status: { $in: ["scheduled", "completed"] } }, { session, projection: { _id: 1 } }).toArray();
  return events.length > 0 && row.eventIds.every((id: ObjectId) => events.some(e => e._id.equals(id)));
}
export async function householdCardChoices(user: User, weddingId: string, householdId: string, cursor?: string) {
  const wedding = await access(user, weddingId); await ready();
  if (!designId.safeParse(householdId).success) throw missing();
  const db = await getDatabase(), h = await db.collection("households").findOne({ _id: new ObjectId(householdId), weddingId: wedding._id, status: "active" });
  if (!h) throw missing();
  const events = await db.collection("events").find({ weddingId: wedding._id, _id: { $in: h.invitedEventIds }, status: { $in: ["scheduled", "completed"] } }).toArray();
  const scope = digest(`${user._id}:${weddingId}:${householdId}:${h.version}`); let before: ObjectId | undefined;
  if (cursor) { try { if (cursor.length > 1500) throw Error(); const c = JSON.parse(Buffer.from(cursor, "base64url").toString()); if (c.scope !== scope || !designId.safeParse(c.id).success || c.signature !== privateKey(`card-choices:${scope}:${c.id}`)) throw Error(); before = new ObjectId(c.id); } catch { throw new AccountError(400, "INVALID_CURSOR", "This household changed. Reload before choosing a card."); } }
  const rows = events.length ? await db.collection("designVersions").find({ weddingId: wedding._id, eventIds: { $not: { $elemMatch: { $nin: events.map(e => e._id) } } }, ...(before ? { _id: { $lt: before } } : {}) }).sort({ _id: -1 }).limit(13).toArray() : [];
  const last = rows[11];
  return { householdName: h.displayName as string, version: h.version as number, selectedId: h.designVersionId?.toString() ?? null, data: await Promise.all(rows.slice(0, 12).map(versionView)), nextCursor: rows.length > 12 ? Buffer.from(JSON.stringify({ scope, id: last._id.toString(), signature: privateKey(`card-choices:${scope}:${last._id}`) })).toString("base64url") : null };
}
export async function selectHouseholdCard(user: User, weddingId: string, householdId: string, payload: unknown, key: string | null) {
  const input = selectionSchema.parse(payload), keyHash = keyOf(key), requestHash = digest(JSON.stringify(input));
  if (!designId.safeParse(householdId).success) throw missing(); await access(user, weddingId); await ready();
  const db = await getDatabase(), scopeKey = `user:${user._id}:household:${householdId}:card`;
  return db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await access(user, weddingId, session, true), h = await db.collection("households").findOne({ _id: new ObjectId(householdId), weddingId: wedding._id, status: "active" }, { session });
    if (!h) throw missing();
    const prior = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (prior) { if (prior.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was already used."); return { saved: true }; }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Card selection is read-only.");
    if (h.version !== input.expectedVersion) throw new AccountError(409, "VERSION_CONFLICT", "This household changed. Reload and review its card selection.");
    if (input.designVersionId) {
      const v = await db.collection("designVersions").findOne({ _id: new ObjectId(input.designVersionId), weddingId: wedding._id }, { session });
      if (!v || !await versionEligible(wedding._id, h, v, session)) throw new AccountError(422, "CARD_INELIGIBLE", "Choose a published card matching this household’s invited events.");
      for (const aid of v.content.draft.assetIds) if (!await db.collection("assets").findOne({ _id: new ObjectId(aid), weddingId: wedding._id, purpose: "invitation", visibility: "family", state: "ready", audienceEventIds: { $size: v.eventIds.length, ...(v.eventIds.length ? { $all: v.eventIds } : {}) } }, { session })) throw new AccountError(422, "CARD_INELIGIBLE", "This card image is unavailable.");
    }
    const now = new Date();
    await db.collection("households").updateOne({ _id: h._id, weddingId: wedding._id, version: h.version }, { ...(input.designVersionId ? { $set: { designVersionId: new ObjectId(input.designVersionId), updatedAt: now } } : { $unset: { designVersionId: "" }, $set: { updatedAt: now } }), $inc: { version: 1 } }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "household", resourceId: h._id, responseCode: 200, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: "household.card_selected", entityType: "household", entityId: h._id, summary: "Household invitation card selection saved", occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return { saved: true };
  }, { writeConcern: { w: "majority" } }));
}
