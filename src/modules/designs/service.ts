import "server-only";
import { ObjectId, type ClientSession, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest, privateKey } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { galleryFamilyAccess } from "@/modules/media/access";
import { createDesignSchema, patchDesignSchema, type DesignInput } from "./schema";
const missing = () => new AccountError(404, "NOT_FOUND", "Invitation draft unavailable.");
async function access(user: User, weddingId: string, session?: ClientSession, mutate = false) { const w = await galleryFamilyAccess(user, session, mutate); if (w._id.toString() !== weddingId) throw missing(); return w; }
export async function designsEnabled() { const db = await getDatabase(), info = await db.listCollections({ name: "designs" }, { nameOnly: false }).next(); return !!info?.options?.validator?.$jsonSchema?.properties?.draft && (await db.collection("designs").indexes()).some(i => i.name === "designs_operation" && i.unique); }
async function ready() { if (!await designsEnabled()) throw new AccountError(503, "DESIGNS_NOT_READY", "Invitation drafts are awaiting activation."); }
export async function designChoices(user: User, weddingId: string) { const w = await access(user, weddingId), rows = await (await getDatabase()).collection("events").find({ weddingId: w._id, status: { $nin: ["removed", "cancelled"] } }, { projection: { name: 1, status: 1, version: 1 } }).sort({ name: 1, _id: 1 }).limit(101).toArray(); if (rows.length > 100) throw new AccountError(503, "EVENT_LIMIT", "Too many events to load. Please try later."); return rows.map(r => ({ id: r._id.toString(), name: r.name as string, status: r.status as string, version: r.version as number })); }
export type DesignView = DesignInput & { id: string; version: number; updatedAt: string; events: { id: string; name: string; available: boolean; changed: boolean }[]; imageAvailable: boolean; published: { id: string; revision: number; hasDraftChanges: boolean } | null };
async function view(row: Document): Promise<DesignView> {
  const db = await getDatabase(), events = await db.collection("events").find({ weddingId: row.weddingId, _id: { $in: row.eventIds } }).toArray();
  const value = createDesignSchema.parse({ name: row.name, mode: row.mode, eventIds: row.eventIds.map((id: ObjectId) => id.toString()), draft: row.draft });
  const asset = value.mode === "uploaded_image" && await db.collection("assets").findOne({ _id: new ObjectId(value.draft.assetIds[0]), weddingId: row.weddingId, purpose: "invitation", visibility: "family", state: "ready" });
  const published = row.latestPublishedVersionId && await db.collection("designVersions").findOne({ _id: row.latestPublishedVersionId, weddingId: row.weddingId, designId: row._id });
  return { ...value, published: published ? { id: published._id.toString(), revision: published.revision, hasDraftChanges: published.sourceVersion !== row.version } : null, id: row._id.toString(), version: row.version, updatedAt: row.updatedAt.toISOString(), imageAvailable: value.mode !== "uploaded_image" || !!asset, events: row.eventIds.map((id: ObjectId) => { const e = events.find(e => e._id.equals(id)); return { id: id.toString(), name: e?.name ?? "Unavailable event", available: !!e && !["removed", "cancelled"].includes(e.status), changed: !e || row.eventVersions?.find((v: Document) => v.eventId.equals(id))?.version !== e.version }; }) };
}
export async function designFor(user: User, weddingId: string, id: string) { const w = await access(user, weddingId); await ready(); if (!/^[a-f0-9]{24}$/.test(id)) return null; const row = await (await getDatabase()).collection("designs").findOne({ _id: new ObjectId(id), weddingId: w._id }); return row ? view(row) : null; }
const querySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(24).default(12), cursor: z.string().max(1500).optional() });
export async function listDesigns(user: User, weddingId: string, query: unknown = {}) {
  const w = await access(user, weddingId); await ready(); const input = querySchema.parse(query), scope = digest(JSON.stringify([weddingId, user._id.toString(), input.limit])), filter: Document = { weddingId: w._id };
  if (input.cursor) { try { const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString()), v = JSON.stringify({ scope: c.scope, at: c.at, id: c.id }); if (c.scope !== scope || c.signature !== privateKey(`designs:${v}`) || !/^[a-f0-9]{24}$/.test(c.id) || new Date(c.at).toISOString() !== c.at) throw Error(); filter.$or = [{ updatedAt: { $lt: new Date(c.at) } }, { updatedAt: new Date(c.at), _id: { $lt: new ObjectId(c.id) } }]; } catch { throw new AccountError(400, "INVALID_CURSOR", "Reload invitation drafts to continue."); } }
  const rows = await (await getDatabase()).collection("designs").find(filter).sort({ updatedAt: -1, _id: -1 }).limit(input.limit + 1).toArray(), page = rows.slice(0, input.limit), last = page.at(-1); let nextCursor: string | null = null;
  if (rows.length > input.limit && last) { const c = { scope, at: last.updatedAt.toISOString(), id: last._id.toString() }; nextCursor = Buffer.from(JSON.stringify({ ...c, signature: privateKey(`designs:${JSON.stringify(c)}`) })).toString("base64url"); }
  return { data: await Promise.all(page.map(view)), pagination: { nextCursor } };
}
export async function saveDesign(user: User, weddingId: string, id: string | null, payload: unknown, key: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid save key is required.");
  if (id && !/^[a-f0-9]{24}$/.test(id)) throw missing(); const input = id ? patchDesignSchema.parse(payload) : createDesignSchema.parse(payload); await access(user, weddingId); await ready();
  const db = await getDatabase(), scopeKey = `user:${user._id}:wedding:${weddingId}:designs:${id ?? "create"}`, keyHash = digest(key), requestHash = digest(JSON.stringify(input)), operationKey = digest(`${user._id}:${key}`);
  const savedId = await db.client.withSession(session => session.withTransaction(async () => {
    const w = await access(user, weddingId, session, true), now = new Date();
    const receipt = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session }), prior = !id ? await db.collection("designs").findOne({ weddingId: w._id, operationKey }, { session }) : null;
    if (receipt || prior) { if ((receipt?.requestHash ?? prior!.createRequestHash) !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This key was used for different changes."); return (receipt?.resourceId ?? prior!._id).toString() as string; }
    if (w.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Invitation drafts are read-only.");
    const old = id ? await db.collection("designs").findOne({ _id: new ObjectId(id), weddingId: w._id }, { session }) : null; if (id && !old) throw missing();
    if (old && old.version !== (input as { expectedVersion: number }).expectedVersion) throw new AccountError(409, "VERSION_CONFLICT", "This draft changed while you were editing. Reload the latest draft before saving.");
    const value = createDesignSchema.parse(old ? { name: old.name, mode: old.mode, eventIds: old.eventIds.map((id: ObjectId) => id.toString()), draft: old.draft, ...Object.fromEntries(Object.entries(input).filter(([k]) => k !== "expectedVersion")) } : input);
    const eventIds = value.eventIds.map(id => new ObjectId(id)), events = await db.collection("events").find({ weddingId: w._id, _id: { $in: eventIds }, status: { $nin: ["removed", "cancelled"] } }, { session }).toArray();
    if (events.length !== eventIds.length) throw new AccountError(422, "EVENT_UNAVAILABLE", "Review the selected events. An event is unavailable.");
    for (const assetId of value.draft.assetIds) { const asset = await db.collection("assets").findOne({ _id: new ObjectId(assetId), weddingId: w._id, purpose: "invitation", visibility: "family", state: "ready" }, { session }); if (!asset || JSON.stringify((asset.audienceEventIds ?? []).map((id: ObjectId) => id.toString()).sort()) !== JSON.stringify([...value.eventIds].sort())) throw new AccountError(422, "IMAGE_SCOPE_CHANGED", "Upload a verified invitation image for the selected event scope."); }
    const resourceId = old?._id ?? new ObjectId(), changes = { name: value.name, draft: value.draft, eventIds, eventVersions: events.map(e => ({ eventId: e._id, version: e.version })), updatedAt: now };
    if (old) await db.collection("designs").updateOne({ _id: old._id, weddingId: w._id, version: old.version }, { $set: changes, $inc: { version: 1 } }, { session });
    else await db.collection("designs").insertOne({ _id: resourceId, weddingId: w._id, mode: value.mode, ...changes, createdBy: user._id, operationKey, createRequestHash: requestHash, version: 1, schemaVersion: 1, createdAt: now }, { session });
    await db.collection("activity").insertOne({ weddingId: w._id, actor: { type: "user", userId: user._id }, action: id ? "design.updated" : "design.created", entityType: "design", entityId: resourceId, summary: "Private invitation draft saved", occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "design", resourceId, responseCode: id ? 200 : 201, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session }); return resourceId.toString() as string;
  }, { writeConcern: { w: "majority" } }));
  if (!savedId) throw Error("Save outcome unavailable"); const result = await designFor(user, weddingId, savedId); if (!result) throw missing(); return result;
}
