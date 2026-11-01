import "server-only";
import { Long, ObjectId, type Document } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "@/modules/weddings/service";
import { createVendorSchema, googleVendorFallbackName, patchVendorSchema, removeVendorSchema, vendorQuerySchema } from "./schema";

export type VendorView = { id: string; name: string; category: string; source: "MANUAL" | "GOOGLE_PLACES"; googlePlaceId?: string; contact?: { person?: string; phone?: string; email?: string; address?: string }; eventIds: string[]; events: { id: string; name: string; available: boolean }[]; notes?: string; status: "active" | "removed"; version: number; createdAt: string; updatedAt: string };
async function access(user: User, weddingId: string) {
  const db = await getDatabase(), member = await membershipFor(user);
  if (!member || member.status !== "active" || member.weddingId.toString() !== weddingId || !["ADMIN", "MANAGER"].includes(member.role)) throw new AccountError(404, "NOT_FOUND", "Vendor unavailable.");
  if (!await db.collection("users").findOne({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } })) throw new AccountError(403, "FORBIDDEN", "Please sign in with a verified account.");
  return member;
}
export async function vendorsReady() {
  const db = await getDatabase();
  if (!await db.listCollections({ name: "vendors" }).hasNext()) throw new AccountError(503, "VENDORS_UNAVAILABLE", "Vendor contacts are temporarily unavailable.");
  const indexes = await db.collection("vendors").indexes();
  if (!["vendors_operation", "vendors_list", "vendors_category", "vendors_events"].every(n => indexes.some(i => i.name === n))) throw new AccountError(503, "VENDORS_UNAVAILABLE", "Vendor contacts are temporarily unavailable.");
}
export async function googleVendorsEnabled() {
  const db = await getDatabase();
  if (!await db.listCollections({ name: "vendors" }).hasNext()) return false;
  return (await db.collection("vendors").indexes()).some(i => i.name === "vendors_google_place" && i.unique && Object.keys(i.key).join(",") === "weddingId,googlePlaceId" && i.partialFilterExpression?.googlePlaceId?.$type === "string");
}
async function views(rows: Document[], weddingId: ObjectId): Promise<VendorView[]> {
  const events = await (await getDatabase()).collection("events").find({ weddingId, _id: { $in: rows.flatMap(r => r.eventIds) } }, { projection: { name: 1, status: 1 } }).toArray();
  return rows.map(r => ({ id: r._id.toString(), name: r.name, category: r.category, source: r.source, ...(r.source === "GOOGLE_PLACES" ? { googlePlaceId: r.googlePlaceId as string } : {}), status: r.status, version: r.version,
    ...(r.contact ? { contact: { ...(r.contact.person ? { person: r.contact.person } : {}), ...(r.contact.phone ? { phone: r.contact.phone } : {}), ...(r.contact.email ? { email: r.contact.email } : {}), ...(r.contact.address ? { address: r.contact.address } : {}) } } : {}),
    ...(r.notes ? { notes: r.notes } : {}), eventIds: r.eventIds.map((id: ObjectId) => id.toString()),
    events: r.eventIds.map((id: ObjectId) => { const e = events.find(e => e._id.equals(id)); return { id: id.toString(), name: e?.name ?? "Unavailable event", available: !!e && !["removed", "cancelled"].includes(e.status) }; }),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));
}
export async function vendorEventChoices(user: User, weddingId: string) {
  const member = await access(user, weddingId);
  const events = await (await getDatabase()).collection("events").find({ weddingId: member.weddingId, status: { $in: ["draft", "scheduled", "completed"] } }, { projection: { name: 1 } }).sort({ name: 1, _id: 1 }).limit(501).toArray();
  if (events.length > 500) throw new AccountError(503, "CHOICES_UNAVAILABLE", "Too many events to load.");
  return events.map(e => ({ id: e._id.toString(), name: e.name as string }));
}
export async function listVendors(user: User, weddingId: string, query: unknown = {}) {
  const member = await access(user, weddingId), input = vendorQuerySchema.parse(query); await vendorsReady(); const db = await getDatabase();
  const filter: Document = { weddingId: member.weddingId, status: input.status };
  if (input.category) filter.category = input.category; if (input.source) filter.source = input.source;
  if (input.eventId) filter.eventIds = input.eventId === "none" ? { $size: 0 } : new ObjectId(input.eventId);
  if (input.q) { const literal = input.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); filter.$or = ["name", "contact.person", "contact.email", "contact.phone"].map(field => ({ [field]: { $regex: literal, $options: "i" } })); }
  const scope = digest(JSON.stringify([weddingId, input.q, input.category, input.source, input.eventId, input.status]));
  const total = await db.collection("vendors").countDocuments(filter);
  if (input.cursor) {
    try {
      const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
      if (c.scope !== scope || !/^[a-f0-9]{24}$/.test(c.id) || typeof c.name !== "string" || c.name.length > 200) throw Error();
      filter.$and = [{ $or: [{ name: { $gt: c.name } }, { name: c.name, _id: { $gt: new ObjectId(c.id) } }] }];
    } catch { throw new AccountError(400, "INVALID_CURSOR", "Reload the vendor list to continue."); }
  }
  const rows = await db.collection("vendors").find(filter).sort({ name: 1, _id: 1 }).limit(input.limit + 1).toArray(), page = rows.slice(0, input.limit), last = page.at(-1);
  return { data: await views(page, member.weddingId), pagination: { total, nextCursor: rows.length > input.limit && last ? Buffer.from(JSON.stringify({ scope, name: last.name, id: last._id.toString() })).toString("base64url") : null } };
}
export async function vendorFor(user: User, weddingId: string, id: string) {
  const member = await access(user, weddingId); await vendorsReady(); if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const row = await (await getDatabase()).collection("vendors").findOne({ _id: new ObjectId(id), weddingId: member.weddingId });
  return row ? (await views([row], member.weddingId))[0] : null;
}
export async function saveVendor(user: User, weddingId: string, id: string | null, payload: unknown, key: string | null, remove = false) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid save key is required.");
  const input = remove ? removeVendorSchema.parse(payload) : id ? patchVendorSchema.parse(payload) : createVendorSchema.parse(payload);
  const member = await access(user, weddingId); await vendorsReady(); const db = await getDatabase();
  const googleInput = !id && "source" in input && input.source === "GOOGLE_PLACES" ? input : null;
  if (googleInput && !await googleVendorsEnabled()) throw new AccountError(503, "GOOGLE_VENDOR_SAVE_UNAVAILABLE", "Saving discovered businesses is temporarily unavailable. Your manual vendor contacts are still available.");
  if (id && !/^[a-f0-9]{24}$/.test(id)) throw new AccountError(404, "NOT_FOUND", "Vendor unavailable.");
  const scopeKey = `user:${user._id}:wedding:${weddingId}:vendors:${id ?? "create"}:${remove ? "remove" : "save"}`, keyHash = digest(key), requestHash = digest(JSON.stringify(input)), operationKey = digest(`${user._id}:${key}`);
  const row = await db.client.withSession(session => session.withTransaction(async () => {
    const now = new Date();
    const wedding = await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    if (!wedding) throw new AccountError(404, "NOT_FOUND", "Vendor unavailable.");
    if (!await db.collection("users").findOneAndUpdate({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" })) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    if (!await db.collection("memberships").findOneAndUpdate({ _id: member._id, userId: user._id, weddingId: wedding._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" })) throw new AccountError(404, "NOT_FOUND", "Vendor unavailable.");
    const previous = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    const existingCreate = !id ? await db.collection("vendors").findOne({ weddingId: wedding._id, operationKey }, { session }) : null;
    if (previous || existingCreate) {
      if ((previous ?? existingCreate)!.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for different changes.");
      const saved = existingCreate ?? await db.collection("vendors").findOne({ _id: previous!.resourceId, weddingId: wedding._id }, { session });
      if (!saved) throw new AccountError(404, "NOT_FOUND", "Vendor unavailable."); return saved;
    }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Vendors are read-only.");
    if (googleInput) {
      const duplicate = await db.collection("vendors").findOne({ weddingId: wedding._id, googlePlaceId: googleInput.googlePlaceId }, { session });
      if (duplicate) throw Object.assign(new AccountError(409, "VENDOR_ALREADY_SAVED", duplicate.status === "removed" ? "This business is already in your removed vendor history." : "This business is already saved to your wedding."), { existingVendorId: duplicate._id.toString(), existingVendorStatus: duplicate.status });
    }
    const old = id ? await db.collection("vendors").findOne({ _id: new ObjectId(id), weddingId: wedding._id }, { session }) : null;
    if (id && (!old || old.status === "removed")) throw new AccountError(404, "NOT_FOUND", "This vendor is no longer available.");
    if (old && old.version !== (input as { expectedVersion: number }).expectedVersion) throw Object.assign(new AccountError(409, "VERSION_CONFLICT", "This vendor was changed by someone else. Review the latest details before saving."), { currentVersion: old.version });
    let saved: Document;
    if (remove) saved = (await db.collection("vendors").findOneAndUpdate({ _id: old!._id, version: old!.version }, { $set: { status: "removed", removedAt: now, updatedAt: now }, $inc: { version: 1 } }, { session, returnDocument: "after" }))!;
    else {
      const changes: Document = { ...input, updatedAt: now }; delete changes.expectedVersion;
      if (changes.eventIds) {
        const retained = new Set((old?.eventIds ?? []).map((id: ObjectId) => id.toString()));
        for (const eventId of changes.eventIds) {
          if (retained.has(eventId)) continue; // Preserve historical associations unless explicitly removed.
          // Event lifecycle writes share the wedding fence; reference validation must not edit the event's timestamp.
          if (!await db.collection("events").findOne({ _id: new ObjectId(eventId), weddingId: wedding._id, status: { $in: ["draft", "scheduled", "completed"] } }, { session })) throw new AccountError(422, "EVENT_UNAVAILABLE", "Choose events from this wedding that are still available.");
        }
        changes.eventIds = changes.eventIds.map((id: string) => new ObjectId(id));
      }
      if (old) {
        const unset: Document = {};
        for (const field of ["contact", "notes"]) if (changes[field] === null) { unset[field] = ""; delete changes[field]; }
        saved = (await db.collection("vendors").findOneAndUpdate({ _id: old._id, version: old.version }, { $set: changes, $inc: { version: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { session, returnDocument: "after" }))!;
      } else {
        saved = { ...changes, name: changes.name ?? googleVendorFallbackName, _id: new ObjectId(), weddingId: wedding._id, status: "active", operationKey, requestHash, createdBy: user._id, version: 1, schemaVersion: 1, createdAt: now };
        await db.collection("vendors").insertOne(saved, { session });
      }
    }
    if (!saved) throw new AccountError(409, "VERSION_CONFLICT", "Review the latest vendor details.");
    const action = remove ? "removed" : old ? "updated" : "created";
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: `vendor.${action}`, entityType: "vendor", entityId: saved._id, summary: `Wedding vendor ${action}`, ...(old ? { beforeVersion: old.version } : {}), afterVersion: saved.version, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "vendor", resourceId: saved._id, responseCode: old ? 200 : 201, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return saved;
  }, { writeConcern: { w: "majority" } }));
  if (!row) throw Error("Vendor save unavailable"); return (await views([row], member.weddingId))[0];
}
