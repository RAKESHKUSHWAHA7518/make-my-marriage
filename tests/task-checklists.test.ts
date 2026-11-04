import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId, BSON } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateTasks } from "../src/infrastructure/mongodb/migrations/005-tasks";
import { migrateTaskChecklists } from "../src/infrastructure/mongodb/migrations/018-task-checklists";
import { createWedding } from "../src/modules/weddings/service";
import { saveTask, taskFor, taskSummary, taskChecklistsEnabled, listTasks } from "../src/modules/tasks/service";
import { checklistSchema } from "../src/modules/tasks/schema";
import { handleWedding } from "../src/modules/weddings/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";
const steps = [{ id: "first", text: "Confirm colours", done: false }, { id: "second", text: "Review backdrop", done: false }];
test("checklist schema bounds plain text, stable unique IDs and boolean completion", () => {
  assert(checklistSchema.safeParse([]).success); assert(checklistSchema.safeParse(steps).success);
  for (const input of [[{ ...steps[0], text: " " }], [{ ...steps[0], done: "yes" }], [steps[0], steps[0]], [{ ...steps[0], id: "<script>" }], [{ ...steps[0], text: "x".repeat(501) }], [{ ...steps[0], dueAt: "today" }], Array.from({ length: 101 }, (_, i) => ({ id: String(i), text: "Step", done: false }))]) assert(!checklistSchema.safeParse(input).success);
});
test("task checklists use only an asserted isolated replica", async t => {
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27196/?replicaSet=checklistsqa");
  const name = `mmm_checklists_test_${randomBytes(8).toString("hex")}`; process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3010";
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex"); process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "checklistsqa");
  const key = () => randomBytes(16).toString("hex");
  async function fixture() { const now = new Date(), email = `${key()}@example.test`, user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Checklist QA", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, createdAt: now, updatedAt: now, schemaVersion: 1 }; await db.collection("users").insertOne(user); const wedding = await createWedding(user, { title: "Isolated Checklist QA", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, key()); return { user, wedding }; }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateTasks(db);
    await t.test("ordinary tasks work before activation; checklist changes fail closed", async () => {
      const f = await fixture(); assert(!await taskChecklistsEnabled()); const task = await saveTask(f.user, f.wedding.id, null, { title: "Existing task" }, key()); assert.deepEqual(task.checklist, []);
      await assert.rejects(saveTask(f.user, f.wedding.id, task.id, { expectedVersion: 1, checklist: steps }, key()), { code: "CHECKLISTS_NOT_READY" });
    });
    await t.test("018 preflights legacy rows, preserves unrelated schema/records/indexes and repeats", async () => {
      const rows = await db.collection("tasks").find().toArray(), wi = await db.collection("weddings").indexes(), ti = await db.collection("tasks").indexes(), before = await db.listCollections({ name: "tasks" }, { nameOnly: false }).next();
      await db.collection("tasks").updateOne({ _id: rows[0]._id }, { $set: { checklist: [{ id: "bad", text: " " }] } }); await assert.rejects(migrateTaskChecklists(db), /requires review/); assert(!await taskChecklistsEnabled());
      await db.collection("tasks").updateOne({ _id: rows[0]._id }, { $set: { checklist: [] } }); await migrateTaskChecklists(db); await migrateTaskChecklists(db); assert(await taskChecklistsEnabled());
      assert.deepEqual(BSON.serialize({ rows: await db.collection("tasks").find().toArray() }), BSON.serialize({ rows })); assert.deepEqual(await db.collection("weddings").indexes(), wi);
      const after = await db.listCollections({ name: "tasks" }, { nameOnly: false }).next(); assert.equal(after!.options!.validationLevel, "strict"); assert.equal(after!.options!.validationAction, "error"); for (const field of ["status", "priority", "dueAt", "attachmentAssetIds", "createdBy"]) assert.deepEqual(after!.options!.validator.$jsonSchema.properties[field], before!.options!.validator.$jsonSchema.properties[field]);
      const indexes = await db.collection("tasks").indexes(); for (const i of ti) assert.deepEqual(indexes.find(a => a.name === i.name), i); assert(indexes.find(i => i.name === "tasks_operation")!.unique);
      await assert.rejects(db.collection("tasks").updateOne({ _id: rows[0]._id }, { $set: { checklist: [steps[0], { ...steps[0], text: "Different same ID" }] } }));
    });
    await t.test("both roles create/edit/clear stable items without changing task status or planning data", async () => {
      for (const role of ["ADMIN", "MANAGER"]) {
        const f = await fixture(); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role } });
        const before = await db.collection("weddings").findOne({ _id: new ObjectId(f.wedding.id) });
        let task = await saveTask(f.user, f.wedding.id, null, { title: "Decorations", description: "Private notes", status: "in_progress", priority: "high", dueAt: "2027-02-10T10:00:00Z", checklist: steps }, key());
        task = await saveTask(f.user, f.wedding.id, task.id, { expectedVersion: 1, checklist: steps.map(i => ({ ...i, done: true })) }, key()); assert.equal(task.status, "in_progress"); assert(!task.completedAt); assert.equal(task.checklist.filter(i => i.done).length, 2);
        task = await saveTask(f.user, f.wedding.id, task.id, { expectedVersion: 2, checklist: task.checklist.map((i, n) => n ? i : { ...i, text: "New wording" }) }, key()); assert(task.checklist[0].done); assert.equal(task.checklist[0].id, "first");
        task = await saveTask(f.user, f.wedding.id, task.id, { expectedVersion: 3, title: "General edit" }, key()); assert.equal(task.checklist[0].text, "New wording");
        task = await saveTask(f.user, f.wedding.id, task.id, { expectedVersion: 4, checklist: [] }, key()); assert.deepEqual(task.checklist, []); assert.equal(task.description, "Private notes"); assert.equal(task.dueAt, "2027-02-10T10:00:00.000Z"); assert.equal(task.priority, "high");
        assert.equal((await taskSummary(f.user, f.wedding.id)).counts.done, 0); const after = await db.collection("weddings").findOne({ _id: before!._id }); for (const field of ["publicPage", "gallery", "storage", "version"]) assert.deepEqual(after![field], before![field]);
      }
    });
    await t.test("whole-task version rejects stale checklist/status updates without lost data", async () => {
      const f = await fixture(), a = await saveTask(f.user, f.wedding.id, null, { title: "Race", checklist: steps }, key());
      const results = await Promise.allSettled([saveTask(f.user, f.wedding.id, a.id, { expectedVersion: 1, checklist: steps.map(i => ({ ...i, done: true })) }, key()), saveTask(f.user, f.wedding.id, a.id, { expectedVersion: 1, status: "done" }, key())]); assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      const current = (await taskFor(f.user, f.wedding.id, a.id))!; assert.equal(current.version, 2); await assert.rejects(saveTask(f.user, f.wedding.id, a.id, { expectedVersion: 1, checklist: [] }, key()), { code: "VERSION_CONFLICT" });
    });
    await t.test("uncertain replay produces one edit/audit and durable create survives receipt expiry", async () => {
      const f = await fixture(), k = key(), body = { title: "One task", checklist: steps };
      const created = await Promise.all([1, 2, 3].map(() => saveTask(f.user, f.wedding.id, null, body, k))); assert(created.every(i => i.id === created[0].id)); await db.collection("idempotencyKeys").deleteMany({ resourceId: new ObjectId(created[0].id) }); assert.equal((await saveTask(f.user, f.wedding.id, null, body, k)).id, created[0].id); await assert.rejects(saveTask(f.user, f.wedding.id, null, { ...body, checklist: [] }, k), { code: "IDEMPOTENCY_CONFLICT" });
      const patch = { expectedVersion: 1, checklist: [{ ...steps[0], done: true }, steps[1]] }, pk = key(); await Promise.all([1, 2, 3].map(() => saveTask(f.user, f.wedding.id, created[0].id, patch, pk))); assert.equal(await db.collection("activity").countDocuments({ entityId: new ObjectId(created[0].id), action: "task.updated" }), 1);
    });
    await t.test("inactive historical references do not prevent a checklist-only change", async () => {
      const f = await fixture(), a = await saveTask(f.user, f.wedding.id, null, { title: "Historical", checklist: steps }, key()), prior = new ObjectId(); await db.collection("tasks").updateOne({ _id: new ObjectId(a.id) }, { $set: { assigneeUserId: prior, eventId: new ObjectId() } });
      const task = await saveTask(f.user, f.wedding.id, a.id, { expectedVersion: 1, checklist: [{ ...steps[0], done: true }] }, key()); assert.equal(task.assigneeUserId, prior.toString()); assert.equal(task.checklist[0].done, true);
    });
    await t.test("cross-wedding, removed/unverified users and archived new writes are denied", async () => {
      const f = await fixture(), other = await fixture(), task = await saveTask(f.user, f.wedding.id, null, { title: "Private", checklist: steps }, key());
      await assert.rejects(saveTask(other.user, f.wedding.id, task.id, { expectedVersion: 1, checklist: [] }, key()), { status: 404 }); assert.equal(await taskFor(other.user, other.wedding.id, task.id), null);
      await db.collection("users").updateOne({ _id: f.user._id }, { $unset: { emailVerifiedAt: "" } }); await assert.rejects(taskFor(f.user, f.wedding.id, task.id), { status: 401 }); await db.collection("users").updateOne({ _id: f.user._id }, { $set: { emailVerifiedAt: new Date() } });
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } }); assert.equal((await taskFor(f.user, f.wedding.id, task.id))!.checklist.length, 2); await assert.rejects(saveTask(f.user, f.wedding.id, task.id, { expectedVersion: 1, checklist: [] }, key()), { code: "WEDDING_ARCHIVED" });
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "removed" } }); await assert.rejects(listTasks(f.user, f.wedding.id), { status: 404 });
    });
    await t.test("HTTP accepts the full bounded 100-item checklist and protects privacy/CSRF", async () => {
      const f = await fixture(), token = randomBytes(32).toString("base64url"), now = new Date(); await db.collection("sessions").insertOne({ userId: f.user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3010/api/v1/weddings/${f.wedding.id}/tasks`, headers = { Origin: "http://localhost:3010", "Content-Type": "application/json", "X-MMM-CSRF": "1", Cookie: `mmm_session=${token}`, "Idempotency-Key": key() }, input = { title: "Full checklist", checklist: Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: "क".repeat(500), done: false })) };
      const created = await handleWedding(new NextRequest(url, { method: "POST", headers, body: JSON.stringify(input) }), "create-task", f.wedding.id); assert.equal(created.status, 201); const result = await created.json(); assert.equal(result.data.checklist.length, 100); assert.match(created.headers.get("cache-control")!, /no-store/); assert(!JSON.stringify(result).includes("operationKey"));
      const patch = { expectedVersion: 1, checklist: [] }; assert.equal((await handleWedding(new NextRequest(url, { method: "PATCH", headers: { ...headers, Origin: "https://foreign.example" }, body: JSON.stringify(patch) }), "update-task", f.wedding.id, result.data.id)).status, 403);
      assert.equal((await handleWedding(new NextRequest(url, { method: "PATCH", headers: { ...headers, Cookie: "mmm_gallery=guest" }, body: JSON.stringify(patch) }), "update-task", f.wedding.id, result.data.id)).status, 401);
    });
  } finally { if (db.databaseName === name && /^mmm_checklists_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase(); await closeDatabase(); }
});
