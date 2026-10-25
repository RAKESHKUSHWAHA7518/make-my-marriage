import "../scripts/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateTasks } from "../src/infrastructure/mongodb/migrations/005-tasks";
import { createWedding } from "../src/modules/weddings/service";
import { createEvent, updateEvent } from "../src/modules/events/service";
import { saveTask, taskFor, listTasks, taskSummary, taskChoices } from "../src/modules/tasks/service";
import { createTaskSchema, taskOverdue } from "../src/modules/tasks/schema";
import { handleWedding } from "../src/modules/weddings/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

test("task boundary validation and overdue semantics", () => {
  assert.equal(createTaskSchema.parse({ title: " Task " }).priority, "normal");
  for (const input of [{ title: "" }, { title: "Task", status: "deleted" }, { title: "Task", weddingId: new ObjectId().toString() }, { title: "Task", checklist: [] }, { title: "Task", dueAt: "not-a-date" }]) assert.equal(createTaskSchema.safeParse(input).success, false);
  for (const status of ["done", "cancelled"]) assert.equal(taskOverdue({ dueAt: "2020-01-01T00:00:00Z", status }, new Date()), false);
  assert.equal(taskOverdue({ status: "todo" }, new Date()), false);
  assert.equal(taskOverdue({ dueAt: "2020-01-01T00:00:00Z", status: "in_progress" }, new Date()), true);
});

test("task management in a guarded isolated database", async (t) => {
  const previous = process.env.MONGODB_DB_NAME, name = `mmm_tasks_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name;
  process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex"); process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name);
  async function fixture() {
    const now = new Date(), email = randomBytes(8).toString("hex") + "@example.test";
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Task test member", passwordHash: "not-used", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated Tasks", couple: { brideName: "Test Bride", groomName: "Test Groom" }, timezone: "Asia/Kolkata", currency: "INR" }, randomBytes(16).toString("hex"));
    return { user, wedding };
  }
  let serial = 0;
  const key = () => `task-test-save-${++serial}-${randomBytes(8).toString("hex")}`;
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db);
    await t.test("readiness never creates a task collection implicitly", async () => {
      const { user, wedding } = await fixture();
      await assert.rejects(listTasks(user, wedding.id), { code: "TASKS_UNAVAILABLE" });
      assert.equal(await db.listCollections({ name: "tasks" }).hasNext(), false);
    });
    await migrateTasks(db); await migrateTasks(db);
    await t.test("ADMIN and MANAGER create private tasks with audit and no email or publication", async () => {
      const { user, wedding } = await fixture();
      const before = await db.collection("weddings").findOne({ _id: new ObjectId(wedding.id) });
      await db.collection("memberships").updateOne({ userId: user._id }, { $set: { role: "MANAGER" } });
      const task = await saveTask(user, wedding.id, null, { title: "Confirm decorations", assigneeUserId: user._id.toString() }, key(), "Asia/Kolkata");
      assert.equal(task.status, "todo"); assert.equal(task.priority, "normal"); assert.equal(task.assignee?.active, true);
      const stored = await db.collection("tasks").findOne({ _id: new ObjectId(task.id) });
      assert.deepEqual(stored!.checklist, []); assert.deepEqual(stored!.attachmentAssetIds, []);
      assert.equal("passwordHash" in task, false); assert.equal("email" in task.assignee!, false);
      const after = await db.collection("weddings").findOne({ _id: new ObjectId(wedding.id) });
      assert.deepEqual(before!.publicPage, after!.publicPage); assert.deepEqual(before!.gallery, after!.gallery);
      assert.equal(await db.collection("deliveries").countDocuments({ weddingId: stored!.weddingId }), 0);
      assert.equal(await db.collection("activity").countDocuments({ entityId: stored!._id, action: "task.created" }), 1);
    });
    await t.test("immutable create/update retries and concurrent edits do not duplicate or overwrite", async () => {
      const { user, wedding } = await fixture(), saveKey = key();
      const results = await Promise.all([1, 2, 3].map(() => saveTask(user, wedding.id, null, { title: "One task" }, saveKey)));
      assert.equal(new Set(results.map((r) => r.id)).size, 1); const task = results[0];
      await assert.rejects(saveTask(user, wedding.id, null, { title: "Different" }, saveKey), { code: "IDEMPOTENCY_CONFLICT" });
      const updateKey = key(), patch = { expectedVersion: 1, title: "Updated" };
      const updated = await Promise.all([1, 2, 3].map(() => saveTask(user, wedding.id, task.id, patch, updateKey)));
      assert(updated.every((r) => r.version === 2));
      assert.equal(await db.collection("activity").countDocuments({ entityId: new ObjectId(task.id), action: "task.updated" }), 1);
      const race = await Promise.allSettled(["A", "B"].map((title) => saveTask(user, wedding.id, task.id, { expectedVersion: 2, title }, key())));
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
      await assert.rejects(saveTask(user, wedding.id, task.id, { expectedVersion: 1, title: "Old" }, key()), { code: "VERSION_CONFLICT", currentVersion: 3 });
    });
    await t.test("due dates stay fixed when an event changes; optional fields clear and completedAt is derived", async () => {
      const { user, wedding } = await fixture();
      const event = await createEvent(user, wedding.id, { name: "Haldi", type: "haldi", startsAt: "2027-01-01T10:00:00Z", venue: { name: "Courtyard", address: "Test address" } }, key());
      let task = await saveTask(user, wedding.id, null, { title: "Prepare Haldi", status: "done", dueAt: "2026-12-31T10:00:00Z", eventId: event.id, description: "Notes", assigneeUserId: user._id.toString() }, key());
      assert(task.completedAt); const completedAt = task.completedAt;
      await updateEvent(user, wedding.id, event.id, { expectedVersion: 1, startsAt: "2027-01-02T10:00:00Z" }, key());
      assert.equal((await taskFor(user, wedding.id, task.id))!.dueAt, task.dueAt);
      task = await saveTask(user, wedding.id, task.id, { expectedVersion: 1, title: "Changed" }, key()); assert.equal(task.completedAt, completedAt);
      task = await saveTask(user, wedding.id, task.id, { expectedVersion: 2, status: "todo", dueAt: null, eventId: null, assigneeUserId: null, description: null }, key());
      assert.equal(task.completedAt, undefined); assert.equal(task.dueAt, undefined); assert.equal(task.eventId, undefined); assert.equal(task.assigneeUserId, undefined); assert.equal(task.description, undefined);
    });
    await t.test("references and tenant boundaries cannot be forged; inactive assignments remain historical", async () => {
      const a = await fixture(), b = await fixture();
      const event = await createEvent(b.user, b.wedding.id, { name: "Private", type: "custom", startsAt: "2027-01-01T10:00:00Z", venue: { name: "Venue", address: "Test address" } }, key());
      await assert.rejects(saveTask(a.user, a.wedding.id, null, { title: "Foreign event", eventId: event.id }, key()), { code: "EVENT_UNAVAILABLE" });
      await assert.rejects(saveTask(a.user, a.wedding.id, null, { title: "Foreign assignee", assigneeUserId: b.user._id.toString() }, key()), { code: "ASSIGNEE_UNAVAILABLE" });
      const task = await saveTask(a.user, a.wedding.id, null, { title: "Private task", assigneeUserId: a.user._id.toString() }, key());
      assert.equal(await taskFor(b.user, b.wedding.id, task.id), null);
      await assert.rejects(taskFor(b.user, a.wedding.id, task.id), { status: 404 });
      const other = new ObjectId(), now = new Date(); await db.collection("memberships").insertOne({ weddingId: new ObjectId(a.wedding.id), userId: other, role: "MANAGER", status: "removed", joinedAt: now, version: 1, schemaVersion: 1, createdAt: now, updatedAt: now });
      await db.collection("tasks").updateOne({ _id: new ObjectId(task.id) }, { $set: { assigneeUserId: other } });
      assert.equal((await taskFor(a.user, a.wedding.id, task.id))!.assignee!.active, false);
      await assert.rejects(saveTask(a.user, a.wedding.id, task.id, { expectedVersion: 1, title: "Keep unavailable assignee" }, key()), { code: "ASSIGNEE_UNAVAILABLE" });
      assert.equal((await saveTask(a.user, a.wedding.id, task.id, { expectedVersion: 1, assigneeUserId: null }, key())).version, 2);
      assert((await taskChoices(a.user, a.wedding.id)).members.every((m) => m.id !== other.toString()));
    });
    await t.test("dashboard counts, overdue work, filters and pagination use all saved tasks", async () => {
      const { user, wedding } = await fixture();
      for (const status of ["todo", "in_progress", "done", "cancelled"]) await saveTask(user, wedding.id, null, { title: status, status, dueAt: "2020-01-01T00:00:00Z", assigneeUserId: user._id.toString() }, key());
      await saveTask(user, wedding.id, null, { title: "No deadline" }, key());
      const summary = await taskSummary(user, wedding.id);
      assert.equal(summary.total, 5); assert.deepEqual(summary.counts, { todo: 2, in_progress: 1, done: 1, cancelled: 1 }); assert.equal(summary.overdue, 2); assert.equal(summary.upcoming.length, 2); assert.equal(summary.assigned.length, 2);
      assert.equal((await listTasks(user, wedding.id, { assigneeUserId: "none" })).data.length, 1);
      assert.equal((await listTasks(user, wedding.id, { assigneeUserId: "me", status: "done" })).data.length, 1);
      assert.equal((await listTasks(user, wedding.id, { dueBefore: "2021-01-01T00:00:00Z" })).data.length, 4);
      const first = await listTasks(user, wedding.id, { limit: 2 }); assert(first.pagination.nextCursor);
      const second = await listTasks(user, wedding.id, { limit: 2, cursor: first.pagination.nextCursor }); assert(!second.data.some((r) => first.data.some((t) => t.id === r.id)));
      await assert.rejects(listTasks(user, wedding.id, { cursor: first.pagination.nextCursor, status: "done" }), { code: "INVALID_CURSOR" });
    });
    await t.test("archive, timezone, removed access and stale credentials are enforced for saves and replays", async () => {
      const { user, wedding } = await fixture(), saveKey = key(), input = { title: "Archived" };
      await assert.rejects(saveTask(user, wedding.id, null, input, key(), "UTC"), { code: "WEDDING_TIMEZONE_CHANGED" });
      const task = await saveTask(user, wedding.id, null, input, saveKey);
      await db.collection("weddings").updateOne({ _id: new ObjectId(wedding.id) }, { $set: { state: "archived" } });
      assert.equal((await saveTask(user, wedding.id, null, input, saveKey)).id, task.id);
      await assert.rejects(saveTask(user, wedding.id, task.id, { expectedVersion: 1, status: "done" }, key()), { code: "WEDDING_ARCHIVED" });
      assert.equal((await taskFor(user, wedding.id, task.id))!.id, task.id);
      await db.collection("memberships").updateOne({ userId: user._id }, { $set: { status: "removed" } });
      await assert.rejects(saveTask(user, wedding.id, null, input, saveKey), { status: 404 });
      await db.collection("memberships").updateOne({ userId: user._id }, { $set: { status: "active" } });
      await db.collection("users").updateOne({ _id: user._id }, { $inc: { credentialVersion: 1 } });
      await assert.rejects(saveTask(user, wedding.id, null, input, saveKey), { status: 401 });
    });
    await t.test("HTTP create/read/patch enforce session/origin and private caching", async () => {
      const { user, wedding } = await fixture(), token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3001/api/v1/weddings/${wedding.id}/tasks`, headers = { Origin: "http://localhost:3001", "Content-Type": "application/json", "X-MMM-CSRF": "1", Cookie: `mmm_session=${token}`, "Idempotency-Key": key() };
      assert.equal((await handleWedding(new NextRequest(url), "list-tasks", wedding.id)).status, 401);
      assert.equal((await handleWedding(new NextRequest(url, { method: "POST", headers: { ...headers, Origin: "https://other.example" }, body: "{}" }), "create-task", wedding.id)).status, 403);
      const created = await handleWedding(new NextRequest(url, { method: "POST", headers, body: JSON.stringify({ title: "HTTP task" }) }), "create-task", wedding.id);
      assert.equal(created.status, 201); const { data } = await created.json();
      const read = await handleWedding(new NextRequest(url + "/" + data.id, { headers }), "task-detail", wedding.id, data.id); assert.equal(read.status, 200); assert.match(read.headers.get("cache-control")!, /no-store/);
      const changed = await handleWedding(new NextRequest(url + "/" + data.id, { method: "PATCH", headers: { ...headers, "Idempotency-Key": key() }, body: JSON.stringify({ expectedVersion: 1, status: "done" }) }), "update-task", wedding.id, data.id);
      assert.equal(changed.status, 200); assert.equal((await changed.json()).data.status, "done");
    });
  } finally {
    if (db.databaseName === name && /^mmm_tasks_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase();
    await closeDatabase(); process.env.MONGODB_DB_NAME = previous;
  }
});
