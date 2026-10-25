import "server-only";
import { Long, ObjectId, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "@/modules/weddings/service";
import { createEventSchema, patchEventSchema, eventTypes } from "./schema";

export type EventView = { id: string; name: string; type: (typeof eventTypes)[number]; startsAt: string; endsAt?: string; venue: { name: string; address: string; mapUrl?: string }; description?: string; dressCode?: string; status: string; version: number };
function view(row: Document): EventView {
  return { id: row._id.toString(), name: row.name, type: row.type, startsAt: row.startsAt.toISOString(), ...(row.endsAt ? { endsAt: row.endsAt.toISOString() } : {}), venue: { name: row.venue.name, address: row.venue.address, ...(row.venue.mapUrl ? { mapUrl: row.venue.mapUrl } : {}) }, description: row.description, dressCode: row.dressCode, status: row.status, version: row.version };
}
async function access(user: User, weddingId: string) {
  const member = await membershipFor(user);
  if (!member || member.status !== "active" || member.weddingId.toString() !== weddingId || !["ADMIN", "MANAGER"].includes(member.role))
    throw new AccountError(404, "NOT_FOUND", "Event unavailable.");
  return member;
}
export async function eventsReady() {
  const db = await getDatabase();
  if (!(await db.listCollections({ name: "events" }).toArray()).length)
    throw new AccountError(503, "EVENTS_UNAVAILABLE", "Event planning is temporarily unavailable. Please try again later.");
  const indexes = await db.collection("events").indexes();
  if (!indexes.some((i) => i.name === "events_chronological"))
    throw new AccountError(503, "EVENTS_UNAVAILABLE", "Event planning is temporarily unavailable. Please try again later.");
}
const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.string().max(2000).optional(),
  status: z.enum(["draft", "scheduled", "completed", "cancelled", "removed"]).optional(), type: z.enum(eventTypes).optional(),
  from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
}).refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), { message: "The end of the date filter must follow its start.", path: ["to"] });
export async function listEvents(user: User, weddingId: string, query: unknown = {}) {
  const member = await access(user, weddingId);
  const input = querySchema.parse(query);
  await eventsReady();
  const filter: Document = { weddingId: member.weddingId, status: input.status ?? { $ne: "removed" } };
  if (input.type) filter.type = input.type;
  if (input.from || input.to) filter.startsAt = { ...(input.from ? { $gte: new Date(input.from) } : {}), ...(input.to ? { $lte: new Date(input.to) } : {}) };
  const scope = JSON.stringify([weddingId, input.status ?? "", input.type ?? "", input.from ?? "", input.to ?? ""]);
  if (input.cursor) {
    try {
      const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (c.scope !== scope || !/^[a-f0-9]{24}$/.test(c.id) || !Number.isFinite(Date.parse(c.at))) throw Error();
      filter.$or = [{ startsAt: { $gt: new Date(c.at) } }, { startsAt: new Date(c.at), _id: { $gt: new ObjectId(c.id) } }];
    } catch { throw new AccountError(400, "INVALID_CURSOR", "Reload the event list to continue."); }
  }
  const rows = await (await getDatabase()).collection("events").find(filter).sort({ startsAt: 1, _id: 1 }).limit(input.limit + 1).toArray();
  const page = rows.slice(0, input.limit), last = page.at(-1);
  return { data: page.map(view), pagination: { nextCursor: rows.length > input.limit && last ? Buffer.from(JSON.stringify({ scope, at: last.startsAt.toISOString(), id: last._id.toString() })).toString("base64url") : null } };
}
export async function eventFor(user: User, weddingId: string, id: string) {
  const member = await access(user, weddingId);
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  await eventsReady();
  const row = await (await getDatabase()).collection("events").findOne({ _id: new ObjectId(id), weddingId: member.weddingId, status: { $ne: "removed" } });
  return row ? view(row) : null;
}
export async function createEvent(user: User, weddingId: string, payload: unknown, key: string | null, expectedTimezone?: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
  const input = createEventSchema.parse(payload);
  const member = await access(user, weddingId);
  await eventsReady();
  const db = await getDatabase();
  const indexes = await db.collection("idempotencyKeys").indexes();
  if (!indexes.some((i) => i.unique && Object.keys(i.key).join() === "scopeKey,keyHash")) throw Error("Idempotency migration required");
  const scopeKey = `user:${user._id}:wedding:${weddingId}:events:create`, keyHash = digest(key), requestHash = digest(JSON.stringify(input));
  return db.client.withSession((session) => session.withTransaction(async () => {
    const now = new Date();
    const wedding = await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    if (!wedding) throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
    const actor = await db.collection<User>("users").findOneAndUpdate({ _id: user._id, status: "active", credentialVersion: user.credentialVersion }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const current = await db.collection("memberships").findOneAndUpdate({ _id: member._id, userId: user._id, weddingId: wedding._id, role: { $in: ["ADMIN", "MANAGER"] }, status: "active" }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!current) throw new AccountError(404, "NOT_FOUND", "Event unavailable.");
    const previous = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was already used for different event details.");
      const row = await db.collection("events").findOne({ _id: previous.resourceId, weddingId: wedding._id, status: { $ne: "removed" } }, { session });
      if (!row) throw new AccountError(404, "NOT_FOUND", "Event unavailable.");
      return view(row);
    }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Events cannot be created.");
    if (expectedTimezone && expectedTimezone !== wedding.timezone) throw new AccountError(409, "WEDDING_TIMEZONE_CHANGED", "Your wedding time zone changed. Reload this form before choosing event times again.");
    const row = { ...input, _id: new ObjectId(), weddingId: wedding._id, startsAt: new Date(input.startsAt), ...(input.endsAt ? { endsAt: new Date(input.endsAt) } : {}), schedule: [], version: 1, schemaVersion: 1, createdAt: now, updatedAt: now, createdBy: user._id };
    await db.collection("events").insertOne(row, { session });
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: "event.created", entityType: "event", entityId: row._id, summary: "Private event draft created", afterVersion: 1, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "event", resourceId: row._id, responseCode: 201, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return view(row);
  }, { writeConcern: { w: "majority" } }));
}

/** Version checked draft edits with durable reconciliation of uncertain saves. */
export async function updateEvent(user: User, weddingId: string, id: string, payload: unknown, key: string | null, expectedTimezone?: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
  const input = patchEventSchema.parse(payload);
  const member = await access(user, weddingId);
  if (!/^[a-f0-9]{24}$/.test(id)) throw new AccountError(404, "NOT_FOUND", "Event unavailable.");
  await eventsReady();
  const db = await getDatabase();
  const indexes = await db.collection("idempotencyKeys").indexes();
  if (!indexes.some((i) => i.unique && Object.keys(i.key).join() === "scopeKey,keyHash")) throw Error("Idempotency migration required");
  const scopeKey = `user:${user._id}:wedding:${weddingId}:event:${id}:update`, keyHash = digest(key), requestHash = digest(JSON.stringify(input));
  return db.client.withSession((session) => session.withTransaction(async () => {
    const now = new Date();
    const wedding = await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    if (!wedding) throw new AccountError(404, "NOT_FOUND", "Event unavailable.");
    const actor = await db.collection<User>("users").findOneAndUpdate({ _id: user._id, status: "active", credentialVersion: user.credentialVersion }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const current = await db.collection("memberships").findOneAndUpdate({ _id: member._id, userId: user._id, weddingId: wedding._id, role: { $in: ["ADMIN", "MANAGER"] }, status: "active" }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!current) throw new AccountError(404, "NOT_FOUND", "Event unavailable.");
    const row = await db.collection("events").findOne({ _id: new ObjectId(id), weddingId: wedding._id, status: { $ne: "removed" } }, { session });
    if (!row) throw new AccountError(404, "NOT_FOUND", "Event unavailable.");
    const previous = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was already used for different changes.");
      return view(row);
    }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Event details are read-only.");
    if (row.status !== "draft") throw new AccountError(409, "EVENT_NOT_DRAFT", "Only draft events can be edited in this phase.");
    if (expectedTimezone && expectedTimezone !== wedding.timezone) throw new AccountError(409, "WEDDING_TIMEZONE_CHANGED", "Your wedding’s time zone has changed. Reload the event and review its dates and times before saving.");
    if (row.version !== input.expectedVersion) throw Object.assign(new AccountError(409, "VERSION_CONFLICT", "This event changed while you were editing. Reload the latest details before saving."), { currentVersion: row.version });
    const { expectedVersion, ...patch } = input;
    const merged = { name: row.name, type: row.type, startsAt: row.startsAt.toISOString(), ...(row.endsAt ? { endsAt: row.endsAt.toISOString() } : {}), venue: row.venue, description: row.description, dressCode: row.dressCode, status: "draft", ...patch };
    for (const field of ["endsAt", "description", "dressCode"] as const) if (merged[field] === null) delete merged[field];
    const validated = createEventSchema.parse(merged);
    const changes: Document = { name: validated.name, type: validated.type, startsAt: new Date(validated.startsAt), venue: { ...row.venue, ...validated.venue }, updatedAt: now };
    // Venue is replaced for this editor's supported fields, while preserving future coordinates.
    if (!validated.venue.mapUrl) delete changes.venue.mapUrl;
    const unset: Document = {};
    for (const field of ["endsAt", "description", "dressCode"] as const) {
      if (validated[field] === undefined) unset[field] = "";
      else changes[field] = field === "endsAt" ? new Date(validated[field]!) : validated[field];
    }
    const updated = await db.collection("events").findOneAndUpdate({ _id: row._id, weddingId: wedding._id, version: expectedVersion, status: "draft" }, { $set: changes, $inc: { version: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { session, returnDocument: "after" });
    if (!updated) throw new AccountError(409, "VERSION_CONFLICT", "This event changed while you were editing. Reload the latest details before saving.");
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: "event.updated", entityType: "event", entityId: row._id, summary: "Private event draft updated", beforeVersion: row.version, afterVersion: updated.version, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "event", resourceId: row._id, responseCode: 200, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return view(updated);
  }, { writeConcern: { w: "majority" } }));
}
