import "server-only";
import { Long, ObjectId, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "@/modules/weddings/service";
import { createTaskSchema, patchTaskSchema, taskStatuses, taskPriorities } from "./schema";

export type TaskView = { id: string; title: string; description?: string; status: (typeof taskStatuses)[number]; priority: (typeof taskPriorities)[number]; version: number; dueAt?: string; completedAt?: string; createdAt: string; updatedAt: string; assigneeUserId?: string; eventId?: string; assignee?: { name: string; active: boolean }; event?: { name: string; available: boolean } };
export type TaskChoices = { members: { id: string; name: string; role: string }[]; events: { id: string; name: string; status: string }[] };
export type TaskSummary = { total: number; counts: Record<(typeof taskStatuses)[number], number>; overdue: number; upcoming: TaskView[]; assigned: TaskView[] };
async function access(user: User, weddingId: string) {
  const member = await membershipFor(user);
  if (!member || member.status !== "active" || member.weddingId.toString() !== weddingId || !["ADMIN", "MANAGER"].includes(member.role)) throw new AccountError(404, "NOT_FOUND", "Task unavailable.");
  return member;
}
export async function tasksReady() {
  const db = await getDatabase();
  if (!await db.listCollections({ name: "tasks" }).hasNext() || !(await db.collection("tasks").indexes()).some((i) => i.name === "tasks_created")) throw new AccountError(503, "TASKS_UNAVAILABLE", "Tasks are temporarily unavailable.");
}
async function views(rows: Document[], weddingId: ObjectId): Promise<TaskView[]> {
  const db = await getDatabase();
  const userIds = rows.flatMap((r) => r.assigneeUserId ? [r.assigneeUserId] : []), eventIds = rows.flatMap((r) => r.eventId ? [r.eventId] : []);
  const [members, events] = await Promise.all([
    db.collection("memberships").aggregate([{ $match: { weddingId, userId: { $in: userIds } } }, { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "person" } }, { $project: { userId: 1, status: 1, name: { $arrayElemAt: ["$person.displayName", 0] }, userStatus: { $arrayElemAt: ["$person.status", 0] } } }]).toArray(),
    db.collection("events").find({ weddingId, _id: { $in: eventIds } }, { projection: { name: 1, status: 1 } }).toArray(),
  ]);
  return rows.map((r) => {
    const member = members.find((m) => m.userId.equals(r.assigneeUserId)), event = events.find((e) => e._id.equals(r.eventId));
    return { id: r._id.toString(), title: r.title, description: r.description, status: r.status, priority: r.priority, version: r.version, dueAt: r.dueAt?.toISOString(), completedAt: r.completedAt?.toISOString(), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      ...(r.assigneeUserId ? { assigneeUserId: r.assigneeUserId.toString(), assignee: { name: member?.name ?? "Unavailable member", active: member?.status === "active" && member?.userStatus === "active" } } : {}),
      ...(r.eventId ? { eventId: r.eventId.toString(), event: { name: event?.name ?? "Unavailable event", available: !!event && event.status !== "removed" } } : {}) };
  });
}
export async function taskChoices(user: User, weddingId: string): Promise<TaskChoices> {
  const member = await access(user, weddingId), db = await getDatabase();
  const [members, events] = await Promise.all([
    db.collection("memberships").aggregate([{ $match: { weddingId: member.weddingId, status: "active", role: { $in: ["ADMIN", "MANAGER"] } } }, { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "person" } }, { $unwind: "$person" }, { $match: { "person.status": "active" } }, { $sort: { "person.displayName": 1, userId: 1 } }, { $limit: 501 }, { $project: { userId: 1, role: 1, name: "$person.displayName" } }]).toArray(),
    db.collection("events").find({ weddingId: member.weddingId, status: { $ne: "removed" } }, { projection: { name: 1, status: 1 } }).sort({ name: 1, _id: 1 }).limit(501).toArray(),
  ]);
  if (members.length > 500 || events.length > 500) throw new AccountError(503, "TASK_CHOICES_LIMIT", "Too many choices to load. Please try again later.");
  return { members: members.map((m) => ({ id: m.userId.toString(), name: m.name, role: m.role })), events: events.map((e) => ({ id: e._id.toString(), name: e.name, status: e.status })) };
}
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.string().max(2500).optional(),
  status: z.enum(taskStatuses).optional(), priority: z.enum(taskPriorities).optional(), eventId: z.union([objectId, z.literal("none")]).optional(),
  assigneeUserId: z.union([objectId, z.literal("none"), z.literal("me")]).optional(), dueBefore: z.iso.datetime({ offset: true }).optional(), dueAfter: z.iso.datetime({ offset: true }).optional(),
}).refine((v) => !v.dueBefore || !v.dueAfter || Date.parse(v.dueAfter) <= Date.parse(v.dueBefore), "Choose a valid deadline range.");
export async function listTasks(user: User, weddingId: string, query: unknown = {}) {
  const member = await access(user, weddingId), input = querySchema.parse(query); await tasksReady();
  const filter: Document = { weddingId: member.weddingId };
  if (input.status) filter.status = input.status;
  if (input.priority) filter.priority = input.priority;
  for (const key of ["eventId", "assigneeUserId"] as const) if (input[key]) filter[key] = input[key] === "none" ? { $exists: false } : input[key] === "me" ? user._id : new ObjectId(input[key]);
  if (input.dueBefore || input.dueAfter) filter.dueAt = { ...(input.dueBefore ? { $lte: new Date(input.dueBefore) } : {}), ...(input.dueAfter ? { $gte: new Date(input.dueAfter) } : {}) };
  const scope = JSON.stringify([weddingId, user._id.toString(), input.status, input.priority, input.eventId, input.assigneeUserId, input.dueBefore, input.dueAfter]);
  if (input.cursor) {
    try { const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString()); if (c.scope !== scope || !/^[a-f0-9]{24}$/.test(c.id) || !Number.isFinite(Date.parse(c.at))) throw Error(); filter.$or = [{ createdAt: { $lt: new Date(c.at) } }, { createdAt: new Date(c.at), _id: { $lt: new ObjectId(c.id) } }]; }
    catch { throw new AccountError(400, "INVALID_CURSOR", "Reload the task list to continue."); }
  }
  const rows = await (await getDatabase()).collection("tasks").find(filter).sort({ createdAt: -1, _id: -1 }).limit(input.limit + 1).toArray(), page = rows.slice(0, input.limit), last = page.at(-1);
  return { data: await views(page, member.weddingId), pagination: { nextCursor: rows.length > input.limit && last ? Buffer.from(JSON.stringify({ scope, at: last.createdAt.toISOString(), id: last._id.toString() })).toString("base64url") : null } };
}
export async function taskFor(user: User, weddingId: string, id: string) {
  const member = await access(user, weddingId); if (!/^[a-f0-9]{24}$/.test(id)) return null; await tasksReady();
  const row = await (await getDatabase()).collection("tasks").findOne({ _id: new ObjectId(id), weddingId: member.weddingId });
  return row ? (await views([row], member.weddingId))[0] : null;
}
export async function taskSummary(user: User, weddingId: string, now = new Date()): Promise<TaskSummary> {
  const member = await access(user, weddingId); await tasksReady(); const db = await getDatabase();
  const [data] = await db.collection("tasks").aggregate([{ $match: { weddingId: member.weddingId } }, { $facet: {
    counts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
    overdue: [{ $match: { status: { $in: ["todo", "in_progress"] }, dueAt: { $lt: now } } }, { $count: "count" }],
    upcoming: [{ $match: { status: { $in: ["todo", "in_progress"] }, dueAt: { $type: "date" } } }, { $sort: { dueAt: 1, _id: 1 } }, { $limit: 3 }],
    assigned: [{ $match: { assigneeUserId: user._id, status: { $in: ["todo", "in_progress"] } } }, { $sort: { createdAt: -1, _id: -1 } }, { $limit: 3 }],
  } }]).toArray();
  const counts = { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
  for (const row of data.counts) if (taskStatuses.includes(row._id)) counts[row._id as keyof typeof counts] = row.count;
  return { total: Object.values(counts).reduce((a, b) => a + b, 0), counts, overdue: data.overdue[0]?.count ?? 0, upcoming: await views(data.upcoming, member.weddingId), assigned: await views(data.assigned, member.weddingId) };
}
/** Both create and edit commit their audit and retry identity in the same transaction. */
export async function saveTask(user: User, weddingId: string, id: string | null, payload: unknown, key: string | null, timezone?: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
  const input = id ? patchTaskSchema.parse(payload) : createTaskSchema.parse(payload), member = await access(user, weddingId);
  if (id && !/^[a-f0-9]{24}$/.test(id)) throw new AccountError(404, "NOT_FOUND", "Task unavailable.");
  await tasksReady(); const db = await getDatabase();
  if (!(await db.collection("idempotencyKeys").indexes()).some((i) => i.unique && Object.keys(i.key).join() === "scopeKey,keyHash")) throw Error("Idempotency migration required");
  const scopeKey = `user:${user._id}:wedding:${weddingId}:tasks:${id ?? "create"}`, keyHash = digest(key), requestHash = digest(JSON.stringify(input));
  const row = await db.client.withSession((session) => session.withTransaction(async () => {
    const now = new Date();
    const wedding = await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    if (!wedding) throw new AccountError(404, "NOT_FOUND", "Task unavailable.");
    const actor = await db.collection("users").findOneAndUpdate({ _id: user._id, status: "active", credentialVersion: user.credentialVersion }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const current = await db.collection("memberships").findOneAndUpdate({ _id: member._id, userId: user._id, weddingId: wedding._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!current) throw new AccountError(404, "NOT_FOUND", "Task unavailable.");
    const previous = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for different changes.");
      const saved = await db.collection("tasks").findOne({ _id: previous.resourceId, weddingId: wedding._id }, { session });
      if (!saved) throw new AccountError(404, "NOT_FOUND", "Task unavailable."); return saved;
    }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Tasks are read-only.");
    if (timezone && timezone !== wedding.timezone) throw new AccountError(409, "WEDDING_TIMEZONE_CHANGED", "Your wedding’s time zone changed. Reload this task and review its deadline before saving.");
    const old = id ? await db.collection("tasks").findOne({ _id: new ObjectId(id), weddingId: wedding._id }, { session }) : null;
    if (id && !old) throw new AccountError(404, "NOT_FOUND", "Task unavailable.");
    if (old && old.version !== (input as z.infer<typeof patchTaskSchema>).expectedVersion) throw Object.assign(new AccountError(409, "VERSION_CONFLICT", "This task changed while you were editing. Reload the latest details before saving."), { currentVersion: old.version });
    const source: Document = old ? { title: old.title, description: old.description, status: old.status, priority: old.priority, eventId: old.eventId?.toString(), assigneeUserId: old.assigneeUserId?.toString(), dueAt: old.dueAt?.toISOString(), ...input } : { ...input };
    delete source.expectedVersion;
    for (const field of ["description", "eventId", "assigneeUserId", "dueAt"]) if (source[field] === null) delete source[field];
    const value = createTaskSchema.parse(source);
    if (value.eventId && !await db.collection("events").findOne({ _id: new ObjectId(value.eventId), weddingId: wedding._id, status: { $ne: "removed" } }, { session })) throw new AccountError(422, "EVENT_UNAVAILABLE", "The related event is unavailable. Select another event or choose Whole wedding.");
    if (value.assigneeUserId) {
      const target = await db.collection("memberships").findOne({ userId: new ObjectId(value.assigneeUserId), weddingId: wedding._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { session });
      const person = target && await db.collection("users").findOne({ _id: target.userId, status: "active" }, { session });
      if (!person) throw new AccountError(422, "ASSIGNEE_UNAVAILABLE", "The assigned member is unavailable. Select an active member or choose Unassigned.");
    }
    const changes: Document = { title: value.title, status: value.status, priority: value.priority, updatedAt: now }, unset: Document = {};
    for (const field of ["description", "eventId", "assigneeUserId", "dueAt"] as const) if (value[field] === undefined) unset[field] = ""; else changes[field] = field === "dueAt" ? new Date(value[field]!) : ["eventId", "assigneeUserId"].includes(field) ? new ObjectId(value[field]) : value[field];
    if (value.status === "done") changes.completedAt = old?.status === "done" && old.completedAt ? old.completedAt : now; else unset.completedAt = "";
    let saved: Document;
    if (old) {
      const updated = await db.collection("tasks").findOneAndUpdate({ _id: old._id, weddingId: wedding._id, version: old.version }, { $set: changes, $unset: unset, $inc: { version: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw new AccountError(409, "VERSION_CONFLICT", "Reload the latest task details."); saved = updated;
    } else {
      saved = { ...changes, _id: new ObjectId(), weddingId: wedding._id, createdBy: user._id, checklist: [], attachmentAssetIds: [], version: 1, schemaVersion: 1, createdAt: now }; await db.collection("tasks").insertOne(saved, { session });
    }
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: old ? "task.updated" : "task.created", entityType: "task", entityId: saved._id, summary: old ? "Wedding task updated" : "Wedding task created", ...(old ? { beforeVersion: old.version } : {}), afterVersion: saved.version, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "task", resourceId: saved._id, responseCode: old ? 200 : 201, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return saved;
  }, { writeConcern: { w: "majority" } }));
  if (!row) throw Error("Task save unavailable"); return (await views([row], member.weddingId))[0];
}
