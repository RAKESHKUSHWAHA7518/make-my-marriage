import "server-only";
import { Long, ObjectId, type Document } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "@/modules/weddings/service";
import { createExpenseSchema, patchExpenseSchema, removeExpenseSchema, expenseQuerySchema, expenseSummaryQuerySchema } from "./schema";

export type ExpenseView = { id: string; title: string; amountMinor: string; currency: string; expenseDate: string; category: string; notes?: string; eventId?: string; event?: { name: string; available: boolean }; vendorId?: string; vendor?: { name: string; status: "active" | "removed" | "unavailable"; source?: "MANUAL" | "GOOGLE_PLACES"; category?: string }; version: number; deletedAt?: string };
export type ExpenseVendorChoice = { id: string; name: string; category: string; source: "MANUAL" | "GOOGLE_PLACES"; status: "active" | "removed" };
export type ExpenseSummary = { currency: string; totalSpentMinor: string; expenseCount: number; budgetMinor: string | null; budgetRemainingMinor: string | null; filtered: boolean };
async function access(user: User, weddingId: string) {
  const member = await membershipFor(user), db = await getDatabase();
  if (!member || member.status !== "active" || member.weddingId.toString() !== weddingId || !["ADMIN", "MANAGER"].includes(member.role)) throw new AccountError(404, "NOT_FOUND", "Expense unavailable.");
  const actor = await db.collection("users").findOne({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } });
  if (!actor) throw new AccountError(403, "FORBIDDEN", "Please sign in with a verified account.");
  return member;
}
export async function expensesReady() {
  const db = await getDatabase();
  if (!await db.listCollections({ name: "expenses" }).hasNext()) throw new AccountError(503, "EXPENSES_UNAVAILABLE", "Expenses are temporarily unavailable.");
  const indexes = await db.collection("expenses").indexes();
  if (!["expenses_operation", "expenses_date", "expenses_category", "expenses_event"].every(n => indexes.some(i => i.name === n))) throw new AccountError(503, "EXPENSES_UNAVAILABLE", "Expenses are temporarily unavailable.");
}
export async function expenseVendorLinksEnabled() {
  const db = await getDatabase(); if (!await db.listCollections({ name: "expenses" }).hasNext()) return false;
  return (await db.collection("expenses").indexes()).some(i => i.name === "expenses_vendor" && i.key.weddingId === 1 && i.key.vendorId === 1);
}
async function requireVendorLinks() { if (!await expenseVendorLinksEnabled()) throw new AccountError(503, "EXPENSE_VENDOR_LINKS_UNAVAILABLE", "Vendor expense links are temporarily unavailable. Your saved expenses have not changed."); }
export async function expenseVendorChoices(user: User, weddingId: string, includeRemoved = false): Promise<ExpenseVendorChoice[]> {
  const member = await access(user, weddingId), db = await getDatabase();
  const rows = await db.collection("vendors").find({ weddingId: member.weddingId, status: { $in: includeRemoved ? ["active", "removed"] : ["active"] } }, { projection: { name: 1, category: 1, source: 1, status: 1 } }).sort({ name: 1, _id: 1 }).limit(501).toArray();
  if (rows.length > 500) throw new AccountError(503, "CHOICES_UNAVAILABLE", "Too many vendors to load. Please contact your wedding administrator.");
  return rows.map(v => ({ id: v._id.toString(), name: v.name as string, category: v.category as string, source: v.source as "MANUAL" | "GOOGLE_PLACES", status: v.status as "active" | "removed" }));
}
async function views(rows: Document[], weddingId: ObjectId): Promise<ExpenseView[]> {
  const db = await getDatabase();
  const [events, vendors] = await Promise.all([
    db.collection("events").find({ weddingId, _id: { $in: rows.flatMap(r => r.eventId ? [r.eventId] : []) } }, { projection: { name: 1, status: 1 } }).toArray(),
    db.collection("vendors").find({ weddingId, _id: { $in: rows.flatMap(r => r.vendorId ? [r.vendorId] : []) } }, { projection: { name: 1, category: 1, source: 1, status: 1 } }).toArray(),
  ]);
  return rows.map(r => {
    const event = events.find(e => e._id.equals(r.eventId));
    const vendor = vendors.find(v => v._id.equals(r.vendorId));
    return { id: r._id.toString(), title: r.title, amountMinor: r.amountMinor.toString(), currency: r.currency, category: r.category, expenseDate: r.expenseDate.toISOString(), version: r.version,
      ...(r.notes ? { notes: r.notes } : {}), ...(r.deletedAt ? { deletedAt: r.deletedAt.toISOString() } : {}),
      ...(r.eventId ? { eventId: r.eventId.toString(), event: { name: event?.name ?? "Unavailable event", available: !!event && event.status !== "removed" } } : {}),
      ...(r.vendorId ? { vendorId: r.vendorId.toString(), vendor: { name: vendor?.name ?? "Unavailable vendor", status: vendor ? vendor.status as "active" | "removed" : "unavailable" as const, ...(vendor ? { category: vendor.category as string, source: vendor.source as "MANUAL" | "GOOGLE_PLACES" } : {}) } } : {}),
    };
  });
}
export async function expenseChoices(user: User, weddingId: string) {
  const member = await access(user, weddingId);
  const events = await (await getDatabase()).collection("events").find({ weddingId: member.weddingId, status: { $in: ["draft", "scheduled", "completed"] } }, { projection: { name: 1 } }).sort({ name: 1, _id: 1 }).limit(501).toArray();
  if (events.length > 500) throw new AccountError(503, "CHOICES_UNAVAILABLE", "Too many events to load.");
  return events.map(e => ({ id: e._id.toString(), name: e.name as string }));
}
function filterFor(weddingId: ObjectId, input: { category?: string; eventId?: string; vendorId?: string; from?: string; to?: string }): Document {
  return { weddingId, deletedAt: { $exists: false }, ...(input.category ? { category: input.category } : {}),
    ...(input.eventId ? { eventId: input.eventId === "none" ? { $exists: false } : new ObjectId(input.eventId) } : {}),
    ...(input.vendorId ? { vendorId: input.vendorId === "none" ? { $exists: false } : new ObjectId(input.vendorId) } : {}),
    ...(input.from || input.to ? { expenseDate: { ...(input.from ? { $gte: new Date(input.from) } : {}), ...(input.to ? { $lte: new Date(input.to) } : {}) } } : {}),
  };
}
export async function listExpenses(user: User, weddingId: string, query: unknown = {}) {
  const member = await access(user, weddingId), input = expenseQuerySchema.parse(query); await expensesReady();
  if (input.vendorId) await requireVendorLinks();
  const db = await getDatabase(), filter = filterFor(member.weddingId, input), scope = digest(JSON.stringify([weddingId, input.category, input.eventId, input.vendorId, input.from, input.to]));
  const total = await db.collection("expenses").countDocuments(filter);
  if (input.cursor) {
    try {
      const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
      if (c.scope !== scope || !/^[a-f0-9]{24}$/.test(c.id) || !Number.isFinite(Date.parse(c.at))) throw Error();
      filter.$or = [{ expenseDate: { $lt: new Date(c.at) } }, { expenseDate: new Date(c.at), _id: { $lt: new ObjectId(c.id) } }];
    } catch { throw new AccountError(400, "INVALID_CURSOR", "Reload the expense list to continue."); }
  }
  const rows = await db.collection("expenses").find(filter).sort({ expenseDate: -1, _id: -1 }).limit(input.limit + 1).toArray(), page = rows.slice(0, input.limit), last = page.at(-1);
  return { data: await views(page, member.weddingId), pagination: { total, nextCursor: rows.length > input.limit && last ? Buffer.from(JSON.stringify({ scope, at: last.expenseDate.toISOString(), id: last._id.toString() })).toString("base64url") : null } };
}
export async function expenseFor(user: User, weddingId: string, id: string) {
  const member = await access(user, weddingId); await expensesReady(); if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const row = await (await getDatabase()).collection("expenses").findOne({ _id: new ObjectId(id), weddingId: member.weddingId });
  return row ? (await views([row], member.weddingId))[0] : null;
}
export async function expenseSummary(user: User, weddingId: string, query: unknown = {}): Promise<ExpenseSummary> {
  const member = await access(user, weddingId), input = expenseSummaryQuerySchema.parse(query); await expensesReady(); const db = await getDatabase();
  if (input.vendorId) await requireVendorLinks();
  // Currency, budget and amounts come from one read snapshot, including a concurrent first expense/currency change.
  const result = await db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await db.collection("weddings").findOne({ _id: member.weddingId }, { session });
    if (!wedding) throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
    // Streaming BigInt addition stays exact even when the combined total exceeds BSON long.
    let total = 0n, count = 0;
    for await (const row of db.collection("expenses").find(filterFor(member.weddingId, input), { projection: { amountMinor: 1 }, session })) { total += BigInt(row.amountMinor.toString()); count++; }
    const filtered = !!(input.category || input.eventId || input.vendorId || input.from || input.to), budget = !filtered && wedding.budgetMinor !== undefined ? wedding.budgetMinor.toString() : null;
    return { currency: wedding.currency as string, totalSpentMinor: total.toString(), expenseCount: count, budgetMinor: budget as string | null, budgetRemainingMinor: budget === null ? null : (BigInt(budget) - total).toString(), filtered };
  }, { readConcern: { level: "snapshot" }, readPreference: "primary" }));
  if (!result) throw Error("Expense summary unavailable"); return result;
}
export async function saveExpense(user: User, weddingId: string, id: string | null, payload: unknown, key: string | null, remove = false, timezone?: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid save key is required.");
  const input = remove ? removeExpenseSchema.parse(payload) : id ? patchExpenseSchema.parse(payload) : createExpenseSchema.parse(payload);
  const member = await access(user, weddingId); await expensesReady(); const db = await getDatabase();
  if ("vendorId" in input && input.vendorId) await requireVendorLinks();
  if (id && !/^[a-f0-9]{24}$/.test(id)) throw new AccountError(404, "NOT_FOUND", "Expense unavailable.");
  const scopeKey = `user:${user._id}:wedding:${weddingId}:expenses:${id ?? "create"}:${remove ? "remove" : "save"}`, keyHash = digest(key), requestHash = digest(JSON.stringify(input));
  const operationKey = digest(`${user._id}:${key}`);
  const row = await db.client.withSession(session => session.withTransaction(async () => {
    const now = new Date();
    const wedding = await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    if (!wedding) throw new AccountError(404, "NOT_FOUND", "Expense unavailable.");
    const actor = await db.collection("users").findOneAndUpdate({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const current = await db.collection("memberships").findOneAndUpdate({ _id: member._id, userId: user._id, weddingId: wedding._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!current) throw new AccountError(404, "NOT_FOUND", "Expense unavailable.");
    const previous = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    const existingCreate = !id ? await db.collection("expenses").findOne({ weddingId: wedding._id, operationKey }, { session }) : null;
    if (previous || existingCreate) {
      if ((previous ?? existingCreate)!.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for different changes.");
      const saved = existingCreate ?? await db.collection("expenses").findOne({ _id: previous!.resourceId, weddingId: wedding._id }, { session });
      if (!saved) throw new AccountError(404, "NOT_FOUND", "Expense unavailable."); return saved;
    }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Expenses are read-only.");
    if (timezone && timezone !== wedding.timezone) throw new AccountError(409, "WEDDING_TIMEZONE_CHANGED", "Your wedding’s time zone changed. Review the latest details before saving.");
    const old = id ? await db.collection("expenses").findOne({ _id: new ObjectId(id), weddingId: wedding._id }, { session }) : null;
    if (id && (!old || old.deletedAt)) throw new AccountError(404, "NOT_FOUND", "This expense is no longer available.");
    if (old && old.version !== (input as { expectedVersion: number }).expectedVersion) throw Object.assign(new AccountError(409, "VERSION_CONFLICT", "This expense was changed by someone else. Review the latest details before saving."), { currentVersion: old.version });
    let saved: Document;
    if (remove) {
      saved = (await db.collection("expenses").findOneAndUpdate({ _id: old!._id, version: old!.version }, { $set: { deletedAt: now, updatedAt: now }, $inc: { version: 1 } }, { session, returnDocument: "after" }))!;
    } else {
      const changes: Document = { ...input }; delete changes.expectedVersion;
      const merged = { ...old, ...changes };
      if (merged.vendorId && (!old?.vendorId || old.vendorId.toString() !== merged.vendorId.toString())) {
        // Vendor removal uses the same wedding fence. Validate without changing the vendor record.
        if (!await db.collection("vendors").findOne({ _id: new ObjectId(merged.vendorId), weddingId: wedding._id, status: "active" }, { session })) throw new AccountError(422, "VENDOR_UNAVAILABLE", "Select an active saved vendor or leave this expense unlinked.");
      }
      if (merged.currency !== wedding.currency) throw new AccountError(409, "CURRENCY_CHANGED", "The wedding currency changed. Review the latest details before saving.");
      if (merged.eventId && (!old?.eventId || old.eventId.toString() !== merged.eventId.toString())) {
        const event = await db.collection("events").findOne({ _id: new ObjectId(merged.eventId), weddingId: wedding._id, status: { $in: ["draft", "scheduled", "completed"] } }, { session });
        if (!event) throw new AccountError(422, "EVENT_UNAVAILABLE", "Select an available event or Wedding-wide.");
      }
      if (changes.amountMinor !== undefined) changes.amountMinor = Long.fromString(changes.amountMinor);
      if (changes.expenseDate !== undefined) changes.expenseDate = new Date(changes.expenseDate);
      if (changes.eventId) changes.eventId = new ObjectId(changes.eventId);
      if (changes.vendorId) changes.vendorId = new ObjectId(changes.vendorId);
      changes.updatedAt = now;
      if (old) {
        const unset: Document = {};
        for (const field of ["notes", "eventId", "vendorId"]) if (changes[field] === null) { unset[field] = ""; delete changes[field]; }
        saved = (await db.collection("expenses").findOneAndUpdate({ _id: old._id, version: old.version }, { $set: changes, $inc: { version: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { session, returnDocument: "after" }))!;
      } else {
        saved = { ...changes, _id: new ObjectId(), weddingId: wedding._id, operationKey, requestHash, createdBy: user._id, version: 1, schemaVersion: 1, createdAt: now };
        await db.collection("expenses").insertOne(saved, { session });
      }
    }
    if (!saved) throw new AccountError(409, "VERSION_CONFLICT", "Review the latest expense details.");
    const action = remove ? "removed" : old ? "updated" : "created";
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: `expense.${action}`, entityType: "expense", entityId: saved._id, summary: `Wedding expense ${action}`, ...(old ? { beforeVersion: old.version } : {}), afterVersion: saved.version, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "expense", resourceId: saved._id, responseCode: old ? 200 : 201, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return saved;
  }, { writeConcern: { w: "majority" } }));
  if (!row) throw Error("Expense save unavailable"); return (await views([row], member.weddingId))[0];
}
