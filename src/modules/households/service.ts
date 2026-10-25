import "server-only";
import { Long, ObjectId, type Document } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "@/modules/weddings/service";
import { createHouseholdSchema, patchHouseholdSchema, removeHouseholdSchema, householdQuerySchema } from "./schema";

export type GuestEvent = { id: string; name: string; status: string; startsAt?: string; venue?: string; available: boolean };
export type HouseholdView = { id: string; displayName: string; representative: { name: string; email?: string; phone?: string }; side: "bride" | "groom" | "both" | "other"; tags: string[]; maxGuests: number; invitedEventIds: string[]; events: GuestEvent[]; notes?: string; status: "active" | "removed"; rsvp: { status: string; attendeeCount: number }; version: number; createdAt: string; updatedAt: string };
export type GuestTotals = { groups: number; maximumPeople: number };
const missing = () => new AccountError(404, "NOT_FOUND", "Guest group unavailable.");
async function access(user: User, weddingId: string) {
  const member = await membershipFor(user);
  if (!member || member.status !== "active" || member.weddingId.toString() !== weddingId || !["ADMIN", "MANAGER"].includes(member.role)) throw missing();
  return member;
}
export async function householdsReady() {
  const db = await getDatabase();
  if (!await db.listCollections({ name: "households" }).hasNext() || !(await db.collection("households").indexes()).some(i => i.name === "households_list")) throw new AccountError(503, "GUESTS_UNAVAILABLE", "Guest groups are temporarily unavailable.");
}
function eventView(e: Document): GuestEvent { return { id: e._id.toString(), name: e.name, status: e.status, startsAt: e.startsAt?.toISOString(), venue: e.venue?.name, available: ["draft", "scheduled", "completed"].includes(e.status) }; }
async function views(rows: Document[], weddingId: ObjectId): Promise<HouseholdView[]> {
  const events = await (await getDatabase()).collection("events").find({ weddingId, _id: { $in: rows.flatMap(r => r.invitedEventIds) } }, { projection: { name: 1, status: 1, startsAt: 1, "venue.name": 1 } }).toArray();
  return rows.map(r => ({ id: r._id.toString(), displayName: r.displayName, representative: { name: r.representative.name, email: r.representative.email, phone: r.representative.phone }, side: r.side, tags: r.tags, maxGuests: r.maxGuests, invitedEventIds: r.invitedEventIds.map((id: ObjectId) => id.toString()),
    events: r.invitedEventIds.map((id: ObjectId) => { const e = events.find(e => e._id.equals(id)); return e ? eventView(e) : { id: id.toString(), name: "Unavailable celebration", status: "unavailable", available: false }; }),
    notes: r.notes, status: r.status, rsvp: { status: r.rsvp.status, attendeeCount: r.rsvp.attendeeCount }, version: r.version, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
}
export async function guestEventChoices(user: User, weddingId: string): Promise<GuestEvent[]> {
  const member = await access(user, weddingId);
  const rows = await (await getDatabase()).collection("events").find({ weddingId: member.weddingId, status: { $in: ["draft", "scheduled", "completed"] } }, { projection: { name: 1, status: 1, startsAt: 1, "venue.name": 1 } }).sort({ startsAt: 1, _id: 1 }).limit(501).toArray();
  if (rows.length > 500) throw new AccountError(503, "EVENT_CHOICES_LIMIT", "Too many celebrations to load. Please contact an administrator.");
  return rows.map(eventView);
}
export async function guestTotals(user: User, weddingId: string): Promise<GuestTotals> {
  const member = await access(user, weddingId); await householdsReady();
  const [row] = await (await getDatabase()).collection("households").aggregate([{ $match: { weddingId: member.weddingId, status: "active" } }, { $group: { _id: null, groups: { $sum: 1 }, maximumPeople: { $sum: "$maxGuests" } } }]).toArray();
  return { groups: row?.groups ?? 0, maximumPeople: row?.maximumPeople ?? 0 };
}
export async function listHouseholds(user: User, weddingId: string, query: unknown = {}) {
  const member = await access(user, weddingId), input = householdQuerySchema.parse(query); await householdsReady();
  const filter: Document = { weddingId: member.weddingId, status: input.status }, clauses: Document[] = [];
  if (input.eventId) filter.invitedEventIds = new ObjectId(input.eventId);
  if (input.rsvpStatus) filter["rsvp.status"] = input.rsvpStatus;
  if (input.q) { const text = input.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); clauses.push({ $or: ["displayName", "representative.name", "representative.email", "representative.phone"].map(field => ({ [field]: { $regex: text, $options: "i" } })) }); }
  const scope = JSON.stringify([weddingId, input.status, input.q ?? "", input.eventId ?? "", input.rsvpStatus ?? ""]);
  const totalFilter = { ...filter, ...(clauses.length ? { $and: [...clauses] } : {}) };
  if (input.cursor) {
    try { const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString()); if (c.scope !== scope || !/^[a-f0-9]{24}$/.test(c.id) || typeof c.name !== "string" || c.name.length > 200) throw Error(); clauses.push({ $or: [{ displayName: { $gt: c.name } }, { displayName: c.name, _id: { $gt: new ObjectId(c.id) } }] }); }
    catch { throw new AccountError(400, "INVALID_CURSOR", "Reload the guest list to continue."); }
  }
  if (clauses.length) filter.$and = clauses;
  const db = await getDatabase();
  const [rows, total] = await Promise.all([db.collection("households").find(filter).sort({ displayName: 1, _id: 1 }).limit(input.limit + 1).toArray(), db.collection("households").countDocuments(totalFilter)]);
  const page = rows.slice(0, input.limit), last = page.at(-1);
  return { data: await views(page, member.weddingId), pagination: { total, nextCursor: rows.length > input.limit && last ? Buffer.from(JSON.stringify({ scope, name: last.displayName, id: last._id.toString() })).toString("base64url") : null } };
}
export async function householdFor(user: User, weddingId: string, id: string) {
  const member = await access(user, weddingId); if (!/^[a-f0-9]{24}$/.test(id)) return null; await householdsReady();
  const row = await (await getDatabase()).collection("households").findOne({ _id: new ObjectId(id), weddingId: member.weddingId });
  return row ? (await views([row], member.weddingId))[0] : null;
}
/** Fences serialize guest changes with event lifecycle, membership and archive actions. */
export async function saveHousehold(user: User, weddingId: string, id: string | null, payload: unknown, key: string | null, remove = false) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
  const input = remove ? removeHouseholdSchema.parse(payload) : id ? patchHouseholdSchema.parse(payload) : createHouseholdSchema.parse(payload);
  const member = await access(user, weddingId); if (id && !/^[a-f0-9]{24}$/.test(id)) throw missing(); await householdsReady();
  const db = await getDatabase();
  if (!(await db.collection("idempotencyKeys").indexes()).some(i => i.unique && Object.keys(i.key).join() === "scopeKey,keyHash")) throw Error("Idempotency migration required");
  const scopeKey = `user:${user._id}:wedding:${weddingId}:households:${id ?? "create"}:${remove ? "remove" : "save"}`, keyHash = digest(key), requestHash = digest(JSON.stringify(input));
  const row = await db.client.withSession(session => session.withTransaction(async () => {
    const now = new Date();
    const wedding = await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    if (!wedding) throw missing();
    const actor = await db.collection("users").findOneAndUpdate({ _id: user._id, status: "active", credentialVersion: user.credentialVersion }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const current = await db.collection("memberships").findOneAndUpdate({ _id: member._id, userId: user._id, weddingId: wedding._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!current) throw missing();
    const previous = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (previous) { if (previous.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for different changes."); const saved = await db.collection("households").findOne({ _id: previous.resourceId, weddingId: wedding._id }, { session }); if (!saved) throw missing(); return saved; }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Guest records are read-only.");
    const old = id ? await db.collection("households").findOne({ _id: new ObjectId(id), weddingId: wedding._id }, { session }) : null;
    if (id && !old) throw missing();
    if (old && old.version !== (input as { expectedVersion: number }).expectedVersion) throw Object.assign(new AccountError(409, "VERSION_CONFLICT", "This guest group changed. Reload the latest details before saving."), { currentVersion: old.version });
    if (old?.status === "removed") throw new AccountError(409, "GUEST_REMOVED", "This guest group has been removed.");
    let saved: Document;
    if (remove && old) {
      // Capability issuance and messaging are not implemented in this increment. Status gates future access.
      saved = (await db.collection("households").findOneAndUpdate({ _id: old._id, weddingId: wedding._id, version: old.version }, { $set: { status: "removed", removedAt: now, updatedAt: now }, $inc: { version: 1 } }, { session, returnDocument: "after" }))!;
    } else {
      const source: Document = old ? { displayName: old.displayName, representative: { name: old.representative.name, email: old.representative.email, phone: old.representative.phone }, side: old.side, tags: old.tags, maxGuests: old.maxGuests, invitedEventIds: old.invitedEventIds.map((v: ObjectId) => v.toString()), notes: old.notes, ...input } : { ...input };
      delete source.expectedVersion; if (source.notes === null) delete source.notes;
      const value = createHouseholdSchema.parse(source), eventIds = value.invitedEventIds.map(v => new ObjectId(v));
      if (await db.collection("events").countDocuments({ weddingId: wedding._id, _id: { $in: eventIds }, status: { $in: ["draft", "scheduled", "completed"] } }, { session }) !== eventIds.length) throw new AccountError(422, "EVENT_UNAVAILABLE", "A selected celebration is unavailable. Remove or replace it before saving.");
      if (old?.rsvp.status === "attending" && value.maxGuests < old.rsvp.attendeeCount) throw new AccountError(409, "GUEST_LIMIT_BELOW_RSVP", "Party size cannot be lower than saved attendance.");
      if (old && old.rsvp.status !== "pending" && [...value.invitedEventIds].sort().join() !== old.invitedEventIds.map((v: ObjectId) => v.toString()).sort().join()) throw new AccountError(409, "RSVP_SCOPE_REVIEW_REQUIRED", "This group has already responded. Event changes require RSVP review, which is not available in this increment.");
      const representative = { ...value.representative, ...(value.representative.email ? { emailNormalized: value.representative.email.toLowerCase() } : {}) };
      const changes: Document = { displayName: value.displayName, representative, side: value.side, tags: value.tags, maxGuests: value.maxGuests, invitedEventIds: eventIds, updatedAt: now };
      if (value.notes !== undefined) changes.notes = value.notes;
      if (old) saved = (await db.collection("households").findOneAndUpdate({ _id: old._id, weddingId: wedding._id, version: old.version }, { $set: changes, ...(value.notes === undefined ? { $unset: { notes: "" } } : {}), $inc: { version: 1 } }, { session, returnDocument: "after" }))!;
      else { saved = { ...changes, _id: new ObjectId(), weddingId: wedding._id, source: "manual", status: "active", rsvp: { status: "pending", attendeeCount: 0, updatedAfterDeadline: false }, version: 1, schemaVersion: 1, createdAt: now }; await db.collection("households").insertOne(saved, { session }); }
    }
    if (!saved) throw new AccountError(409, "VERSION_CONFLICT", "Reload the latest guest group.");
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: remove ? "household.removed" : old ? "household.updated" : "household.created", entityType: "household", entityId: saved._id, summary: remove ? "Guest group removed" : old ? "Guest group updated" : "Guest group created", ...(old ? { beforeVersion: old.version } : {}), afterVersion: saved.version, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "household", resourceId: saved._id, responseCode: old ? 200 : 201, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return saved;
  }, { writeConcern: { w: "majority" } }));
  if (!row) throw Error("Guest save unavailable"); return (await views([row], member.weddingId))[0];
}
