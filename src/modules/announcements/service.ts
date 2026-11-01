import "server-only";
import { Long, ObjectId, type ClientSession, type Document } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest, privateKey } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { announcementQuerySchema, createAnnouncementSchema, patchAnnouncementSchema, removeAnnouncementSchema } from "./schema";

const missing = () => new AccountError(404, "NOT_FOUND", "Announcement unavailable.");
export type AnnouncementView = { id: string; title: string; body: string; pinned: boolean; author: { name: string }; version: number; createdAt: string; updatedAt: string };
async function access(user: User, weddingId: string, session?: ClientSession, mutate = false) {
  const db = await getDatabase(), member = await db.collection("memberships").findOne({ userId: user._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { session });
  if (!member || member.weddingId.toString() !== weddingId) throw missing();
  const now = new Date();
  const wedding = mutate ? await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" }) : await db.collection("weddings").findOne({ _id: member.weddingId }, { session });
  if (!wedding) throw missing();
  const actorFilter = { _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } };
  const actor = mutate ? await db.collection("users").findOneAndUpdate(actorFilter, { $set: { updatedAt: now } }, { session, returnDocument: "after" }) : await db.collection("users").findOne(actorFilter, { session });
  if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in with a verified account.");
  if (mutate && !await db.collection("memberships").findOneAndUpdate({ _id: member._id, userId: user._id, weddingId: wedding._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" })) throw missing();
  return wedding;
}
export async function announcementsReady() {
  const db = await getDatabase(), info = await db.listCollections({ name: "announcements" }, { nameOnly: false }).next();
  const indexes = info ? await db.collection("announcements").indexes() : [];
  if (!info?.options?.validator?.$jsonSchema?.properties?.createRequestHash || !indexes.some(i => i.name === "announcements_feed") || !indexes.some(i => i.name === "announcements_operation" && i.unique)) throw new AccountError(503, "ANNOUNCEMENTS_UNAVAILABLE", "Family announcements are temporarily unavailable.");
}
async function views(rows: Document[], weddingId: ObjectId): Promise<AnnouncementView[]> {
  const people = await (await getDatabase()).collection("memberships").aggregate([{ $match: { weddingId, userId: { $in: rows.map(r => r.createdBy) } } }, { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "person" } }, { $project: { userId: 1, name: { $arrayElemAt: ["$person.displayName", 0] } } }]).toArray();
  return rows.map(r => ({ id: r._id.toString(), title: r.title, body: r.body, pinned: r.pinned, version: r.version, author: { name: people.find(p => p.userId.equals(r.createdBy))?.name ?? "Unavailable member" }, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
}
export async function announcementFor(user: User, weddingId: string, id: string) {
  const w = await access(user, weddingId); await announcementsReady();
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const row = await (await getDatabase()).collection("announcements").findOne({ _id: new ObjectId(id), weddingId: w._id, deletedAt: { $exists: false } });
  return row ? (await views([row], w._id))[0] : null;
}
export async function listAnnouncements(user: User, weddingId: string, query: unknown = {}) {
  const w = await access(user, weddingId), input = announcementQuerySchema.parse(query); await announcementsReady();
  const db = await getDatabase(), filter: Document = { weddingId: w._id, deletedAt: { $exists: false } }, scope = digest(JSON.stringify([weddingId, user._id.toString(), input.limit]));
  if (input.cursor) {
    try {
      const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
      const value = JSON.stringify({ scope: c.scope, pinned: c.pinned, at: c.at, id: c.id });
      if (c.scope !== scope || c.signature !== privateKey(`announcements:${value}`) || typeof c.pinned !== "boolean" || !/^[a-f0-9]{24}$/.test(c.id) || typeof c.at !== "string" || new Date(c.at).toISOString() !== c.at) throw Error();
      filter.$or = [...(c.pinned ? [{ pinned: false }] : []), { pinned: c.pinned, createdAt: { $lt: new Date(c.at) } }, { pinned: c.pinned, createdAt: new Date(c.at), _id: { $lt: new ObjectId(c.id) } }];
    } catch { throw new AccountError(400, "INVALID_CURSOR", "Reload announcements to continue."); }
  }
  const rows = await db.collection("announcements").find(filter).sort({ pinned: -1, createdAt: -1, _id: -1 }).limit(input.limit + 1).toArray(), page = rows.slice(0, input.limit), last = page.at(-1);
  let nextCursor: string | null = null;
  if (rows.length > input.limit && last) { const c = { scope, pinned: last.pinned as boolean, at: last.createdAt.toISOString(), id: last._id.toString() }; nextCursor = Buffer.from(JSON.stringify({ ...c, signature: privateKey(`announcements:${JSON.stringify(c)}`) })).toString("base64url"); }
  return { data: await views(page, w._id), pagination: { nextCursor } };
}
export async function announcementSummary(user: User, weddingId: string) {
  const w = await access(user, weddingId); await announcementsReady();
  const rows = await (await getDatabase()).collection("announcements").find({ weddingId: w._id, deletedAt: { $exists: false } }).sort({ pinned: -1, createdAt: -1, _id: -1 }).limit(3).toArray();
  return (await views(rows, w._id)).map(({ body, ...row }) => ({ ...row, excerpt: body.length > 180 ? body.slice(0, 180) + "…" : body }));
}
export type AnnouncementSummary = Awaited<ReturnType<typeof announcementSummary>>;
export async function saveAnnouncement(user: User, weddingId: string, id: string | null, payload: unknown, key: string | null, remove = false) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid save key is required.");
  if ((id && !/^[a-f0-9]{24}$/.test(id)) || (remove && !id)) throw missing();
  const input = remove ? removeAnnouncementSchema.parse(payload) : id ? patchAnnouncementSchema.parse(payload) : createAnnouncementSchema.parse(payload);
  await access(user, weddingId); await announcementsReady();
  const db = await getDatabase(), scopeKey = `user:${user._id}:wedding:${weddingId}:announcements:${id ?? "create"}:${remove ? "remove" : "save"}`, keyHash = digest(key), requestHash = digest(JSON.stringify(input)), operationKey = digest(`${user._id}:${key}`);
  const result = await db.client.withSession(session => session.withTransaction(async () => {
    const w = await access(user, weddingId, session, true), now = new Date();
    const prior = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    const previousCreate = !id ? await db.collection("announcements").findOne({ weddingId: w._id, operationKey }, { session }) : null;
    if (prior || previousCreate) {
      if ((prior?.requestHash ?? previousCreate!.createRequestHash) !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for different changes.");
      return { id: (prior?.resourceId ?? previousCreate!._id).toString() as string, removed: !!(remove || previousCreate?.deletedAt) };
    }
    if (w.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Announcements are read-only.");
    const existing = id ? await db.collection("announcements").findOne({ _id: new ObjectId(id), weddingId: w._id, deletedAt: { $exists: false } }, { session }) : null;
    if (id && !existing) throw missing();
    if (existing && existing.version !== (input as { expectedVersion: number }).expectedVersion) throw new AccountError(409, "VERSION_CONFLICT", "This announcement changed while you were editing. Your changes haven’t been saved.");
    const resourceId = existing?._id ?? new ObjectId();
    if (!id) {
      const create = createAnnouncementSchema.parse(input);
      await db.collection("announcements").insertOne({ _id: resourceId, weddingId: w._id, ...create, createdBy: user._id, operationKey, createRequestHash: requestHash, version: 1, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    } else {
      const changes: Document = { updatedAt: now };
      if (remove) changes.deletedAt = now;
      else for (const field of ["title", "body", "pinned"] as const) if (field in input) changes[field] = (input as Document)[field];
      await db.collection("announcements").updateOne({ _id: resourceId, weddingId: w._id, version: existing!.version }, { $set: changes, $inc: { version: 1 } }, { session });
    }
    await db.collection("activity").insertOne({ weddingId: w._id, actor: { type: "user", userId: user._id }, action: `announcement.${remove ? "removed" : id ? "updated" : "created"}`, entityType: "announcement", entityId: resourceId, summary: remove ? "Family announcement removed" : id ? "Family announcement updated" : "Family announcement posted", occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "announcement", resourceId, responseCode: !id ? 201 : 200, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return { id: resourceId.toString() as string, removed: remove };
  }, { writeConcern: { w: "majority" } }));
  if (!result) throw Error("Announcement outcome unavailable");
  if (result.removed) return result;
  const saved = await announcementFor(user, weddingId, result.id);
  return saved ? { ...saved, removed: false } : { id: result.id, removed: true };
}
