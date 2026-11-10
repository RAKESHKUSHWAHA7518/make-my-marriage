import "server-only";
import { Long, ObjectId, type ClientSession, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest, privateKey } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";

export type CommentView = {
  id: string; body: string; author: { name: string }; version: number; createdAt: string; editedAt?: string;
};

const oid = z.string().regex(/^[a-f0-9]{24}$/);
const create = z.strictObject({ body: z.string().trim().min(1).max(10000) });
const version = z.strictObject({ expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
const patch = create.extend(version.shape);
const pagination = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.string().max(512).optional() });
const missing = () => new AccountError(404, "NOT_FOUND", "Task or comment unavailable.");

async function context(user: User, weddingId: string, taskId: string, session?: ClientSession) {
  if (!oid.safeParse(weddingId).success || !oid.safeParse(taskId).success) throw missing();
  const db = await getDatabase(), scope = { weddingId: new ObjectId(weddingId), taskId: new ObjectId(taskId) };
  const memberFilter = { weddingId: scope.weddingId, userId: user._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } };
  if (!await db.collection("memberships").findOne(memberFilter, { session, projection: { _id: 1 } })) throw missing();
  const now = new Date(), weddingFilter = { _id: scope.weddingId };
  const wedding = session
    ? await db.collection("weddings").findOneAndUpdate(weddingFilter, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" })
    : await db.collection("weddings").findOne(weddingFilter);
  if (!wedding) throw missing();
  const actorFilter = { _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } };
  const actor = session
    ? await db.collection("users").findOneAndUpdate(actorFilter, { $set: { updatedAt: now } }, { session, returnDocument: "after" })
    : await db.collection("users").findOne(actorFilter, { projection: { _id: 1 } });
  if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in with a verified account.");
  if (session && !await db.collection("memberships").findOneAndUpdate(memberFilter, { $set: { updatedAt: now } }, { session })) throw missing();
  if (!await db.collection("tasks").findOne({ _id: scope.taskId, weddingId: scope.weddingId }, { session, projection: { _id: 1 } })) throw missing();
  return { db, scope, wedding };
}

async function ready() {
  const db = await getDatabase(), info = await db.listCollections({ name: "comments" }, { nameOnly: false }).next();
  const indexes = info ? await db.collection("comments").indexes() : [];
  if (!info?.options?.validator?.$jsonSchema?.properties?.createRequestHash ||
      !indexes.some(index => index.name === "comments_thread") ||
      !indexes.some(index => index.name === "comments_operation" && index.unique)) {
    throw new AccountError(503, "COMMENTS_UNAVAILABLE", "Comments are temporarily unavailable.");
  }
}

async function views(rows: Document[], weddingId: ObjectId, session?: ClientSession): Promise<CommentView[]> {
  if (!rows.length) return [];
  const db = await getDatabase();
  const authors = await db.collection("memberships").aggregate([
    { $match: { weddingId, userId: { $in: rows.map(row => row.authorUserId) } } },
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "author" } },
    { $project: { userId: 1, name: { $arrayElemAt: ["$author.displayName", 0] } } },
  ], { session }).toArray();
  return rows.map(row => ({
    id: row._id.toString(), body: row.body, version: row.version,
    author: { name: authors.find(author => author.userId.equals(row.authorUserId))?.name ?? "Unavailable member" },
    createdAt: row.createdAt.toISOString(), editedAt: row.editedAt?.toISOString(),
  }));
}

const cursorFields = z.strictObject({ at: z.iso.datetime(), id: oid, signature: z.string().length(64) });

export async function listTaskComments(user: User, weddingId: string, taskId: string, query: unknown = {}) {
  const { db, scope, wedding } = await context(user, weddingId, taskId);
  const { limit, cursor } = pagination.parse(query);
  await ready();
  const filter: Document = { ...scope, deletedAt: { $exists: false } };
  const signature = (at: string, id: string) => privateKey(JSON.stringify(["task-comments", weddingId, taskId, user._id.toString(), limit, at, id]));
  if (cursor) {
    try {
      const { at, id, signature: received } = cursorFields.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
      if (received !== signature(at, id)) throw Error();
      const time = new Date(at);
      filter.$or = [{ createdAt: { $lt: time } }, { createdAt: time, _id: { $lt: new ObjectId(id) } }];
    } catch {
      throw new AccountError(400, "INVALID_CURSOR", "Reload comments to continue.");
    }
  }
  const rows = await db.collection("comments").find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
  const page = rows.slice(0, limit), last = page.at(-1);
  let nextCursor = null;
  if (rows.length > limit && last) {
    const at = last.createdAt.toISOString(), id = last._id.toString();
    nextCursor = Buffer.from(JSON.stringify({ at, id, signature: signature(at, id) })).toString("base64url");
  }
  return { data: await views(page, scope.weddingId), pagination: { nextCursor }, readOnly: wedding.state !== "active" };
}

export async function saveTaskComment(user: User, weddingId: string, taskId: string, action: "create" | "patch" | "remove", id: string | undefined, payload: unknown, key: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid save key is required.");
  if (action !== "create" && !oid.safeParse(id).success) throw missing();
  const input = (action === "create" ? create : action === "patch" ? patch : version).parse(payload);
  const { db } = await context(user, weddingId, taskId);
  await ready();
  const scopeKey = `user:${user._id}:wedding:${weddingId}:task:${taskId}:comments:${action}:${id ?? ""}`;
  const keyHash = digest(key), requestHash = digest(JSON.stringify(input)), operationKey = digest(`${user._id}:${key}`);
  const outcome = await db.client.withSession(session => session.withTransaction(async () => {
    const { scope, wedding } = await context(user, weddingId, taskId, session);
    const comments = db.collection("comments"), receipts = db.collection("idempotencyKeys");
    const prior = await receipts.findOne({ scopeKey, keyHash }, { session });
    const previousCreate = action === "create" ? await comments.findOne({ ...scope, operationKey }, { session }) : null;
    if (prior || previousCreate) {
      if ((prior?.requestHash ?? previousCreate?.createRequestHash) !== requestHash) {
        throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for different changes.");
      }
      const row = previousCreate ?? await comments.findOne({ ...scope, _id: prior?.resourceId }, { session });
      if (!row) throw missing();
      return row.deletedAt ? { id: row._id.toString(), version: row.version as number, removed: true as const } : (await views([row], scope.weddingId, session))[0];
    }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Comments are read-only.");
    const now = new Date();
    let row: Document;
    if ("expectedVersion" in input) {
      const filter = { ...scope, _id: new ObjectId(id), deletedAt: { $exists: false } };
      const existing = await comments.findOne(filter, { session });
      if (!existing) throw new AccountError(404, "COMMENT_UNAVAILABLE", "This comment is no longer available.");
      if (existing.version !== input.expectedVersion) {
        throw new AccountError(409, "VERSION_CONFLICT", "This comment changed. Reload the thread before editing it again.");
      }
      const changes = "body" in input ? { body: input.body, editedAt: now } : { deletedAt: now };
      const updated = await comments.findOneAndUpdate({ ...filter, version: input.expectedVersion }, { $set: { ...changes, updatedAt: now }, $inc: { version: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw missing();
      row = updated;
    } else {
      row = { _id: new ObjectId(), ...scope, authorUserId: user._id, body: input.body, operationKey, createRequestHash: requestHash, version: 1, schemaVersion: 1, createdAt: now, updatedAt: now };
      await comments.insertOne(row, { session });
    }
    const verb = { create: "created", patch: "updated", remove: "removed" }[action];
    await db.collection("activity").insertOne({
      weddingId: scope.weddingId, actor: { type: "user", userId: user._id }, action: `comment.${verb}`,
      entityType: "comment", entityId: row._id, summary: `Task comment ${verb}`,
      afterVersion: row.version, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now,
    }, { session });
    await receipts.insertOne({
      scopeKey, keyHash, requestHash, state: "completed", resourceType: "comment", resourceId: row._id,
      responseCode: action === "create" ? 201 : 200, expiresAt: new Date(now.getTime() + 7 * 86400000),
      schemaVersion: 1, createdAt: now, updatedAt: now,
    }, { session });
    return row.deletedAt ? { id: row._id.toString(), version: row.version as number, removed: true as const } : (await views([row], scope.weddingId, session))[0];
  }, { writeConcern: { w: "majority" } }));
  if (!outcome) throw Error("Comment outcome unavailable");
  return outcome;
}
