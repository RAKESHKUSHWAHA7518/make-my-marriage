import type { Db } from "mongodb";
/** Explicit collection/index activation, without sample records or wedding backfill. */
export async function migrateAnnouncements(db: Db) {
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" };
  const validator = { $jsonSchema: { bsonType: "object", additionalProperties: false, required: ["weddingId", "title", "body", "pinned", "createdBy", "operationKey", "createRequestHash", "version", "schemaVersion", "createdAt", "updatedAt"], properties: {
    _id: oid, weddingId: oid, title: { bsonType: "string", minLength: 1, maxLength: 200 }, body: { bsonType: "string", minLength: 1, maxLength: 10000 }, pinned: { bsonType: "bool" }, createdBy: oid,
    operationKey: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, createRequestHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
    version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date, deletedAt: date,
  } } };
  if (await db.listCollections({ name: "announcements" }).hasNext()) {
    if (await db.collection("announcements").findOne({ $nor: [validator] }, { projection: { _id: 1 } })) throw Error("Existing announcements require review before activation.");
    await db.command({ collMod: "announcements", validator, validationLevel: "strict", validationAction: "error" });
  } else await db.createCollection("announcements", { validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("announcements").createIndex({ weddingId: 1, pinned: -1, createdAt: -1, _id: -1 }, { name: "announcements_feed" });
  await db.collection("announcements").createIndex({ weddingId: 1, operationKey: 1 }, { name: "announcements_operation", unique: true });
}
