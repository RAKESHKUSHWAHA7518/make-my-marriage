import type { Db } from "mongodb";
/** Maintenance-only migration. Never invoked from application requests. */
export async function migrateTasks(db: Db) {
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" };
  const validator = { $jsonSchema: { bsonType: "object", required: ["weddingId", "title", "status", "priority", "checklist", "attachmentAssetIds", "createdBy", "version", "schemaVersion", "createdAt", "updatedAt"], properties: {
    weddingId: oid, eventId: oid, assigneeUserId: oid, createdBy: oid,
    title: { bsonType: "string", minLength: 1, maxLength: 200 }, description: { bsonType: "string", maxLength: 10000 },
    status: { enum: ["todo", "in_progress", "done", "cancelled"] }, priority: { enum: ["low", "normal", "high"] },
    dueAt: date, completedAt: date, createdAt: date, updatedAt: date,
    checklist: { bsonType: "array", maxItems: 100, items: { bsonType: "object" } }, attachmentAssetIds: { bsonType: "array", maxItems: 20, items: oid },
    version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, schemaVersion: { enum: [1] },
  } } };
  if (await db.listCollections({ name: "tasks" }).hasNext()) await db.command({ collMod: "tasks", validator, validationLevel: "strict", validationAction: "error" });
  else await db.createCollection("tasks", { validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("tasks").createIndex({ weddingId: 1, createdAt: -1, _id: -1 }, { name: "tasks_created" });
  await db.collection("tasks").createIndex({ weddingId: 1, status: 1, dueAt: 1, _id: 1 }, { name: "tasks_status_due" });
  await db.collection("tasks").createIndex({ weddingId: 1, assigneeUserId: 1, status: 1, dueAt: 1 }, { name: "tasks_assignee_due" });
  await db.collection("tasks").createIndex({ weddingId: 1, eventId: 1, createdAt: -1 }, { name: "tasks_event" });
}
