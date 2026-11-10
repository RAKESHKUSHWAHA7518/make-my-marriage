import type { Db } from "mongodb";

export async function migrateTaskComments(db: Db) {
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" };
  const hash = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
  const validator = { $jsonSchema: {
    bsonType: "object", additionalProperties: false,
    required: ["weddingId", "taskId", "authorUserId", "body", "operationKey", "createRequestHash", "version", "schemaVersion", "createdAt", "updatedAt"],
    properties: {
      _id: oid, weddingId: oid, taskId: oid, authorUserId: oid,
      body: { bsonType: "string", minLength: 1, maxLength: 10000 },
      operationKey: hash, createRequestHash: hash,
      version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 },
      schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date, editedAt: date, deletedAt: date,
    },
  } };
  if (await db.listCollections({ name: "comments" }).hasNext()) {
    if (await db.collection("comments").findOne({ $nor: [validator] }, { projection: { _id: 1 } })) {
      throw Error("Existing comments require review before activation.");
    }
    await db.command({ collMod: "comments", validator, validationLevel: "strict", validationAction: "error" });
  } else {
    await db.createCollection("comments", { validator, validationLevel: "strict", validationAction: "error" });
  }
  await db.collection("comments").createIndex({ weddingId: 1, taskId: 1, createdAt: 1, _id: 1 }, { name: "comments_thread" });
  await db.collection("comments").createIndex({ weddingId: 1, taskId: 1, operationKey: 1 }, { name: "comments_operation", unique: true });
}
