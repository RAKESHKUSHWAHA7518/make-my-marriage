import type { Db } from "mongodb";

/** Explicit manual-vendor migration; does not alter expenses or call external providers. */
export async function migrateVendors(db: Db) {
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" };
  const text = { bsonType: "string", minLength: 1, maxLength: 200 };
  const validator = { $jsonSchema: { bsonType: "object", additionalProperties: false,
    required: ["_id", "weddingId", "name", "category", "source", "eventIds", "status", "operationKey", "requestHash", "createdBy", "version", "schemaVersion", "createdAt", "updatedAt"],
    properties: {
      _id: oid, weddingId: oid, createdBy: oid, name: text,
      category: { enum: ["venue", "catering", "photography", "decoration", "mehendi", "priest", "clothing", "other"] }, source: { enum: ["MANUAL"] },
      contact: { bsonType: "object", additionalProperties: false, properties: { person: text, phone: { bsonType: "string", minLength: 5, maxLength: 40 }, email: { bsonType: "string", maxLength: 254 }, address: { bsonType: "string", minLength: 1, maxLength: 2000 } } },
      eventIds: { bsonType: "array", maxItems: 100, uniqueItems: true, items: oid }, notes: { bsonType: "string", maxLength: 10000 },
      status: { enum: ["active", "removed"] }, removedAt: date,
      operationKey: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, requestHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
      version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date,
    },
  } };
  if (await db.listCollections({ name: "vendors" }).hasNext()) await db.command({ collMod: "vendors", validator, validationLevel: "strict", validationAction: "error" });
  else await db.createCollection("vendors", { validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("vendors").createIndex({ weddingId: 1, operationKey: 1 }, { unique: true, name: "vendors_operation" });
  await db.collection("vendors").createIndex({ weddingId: 1, status: 1, name: 1, _id: 1 }, { name: "vendors_list" });
  await db.collection("vendors").createIndex({ weddingId: 1, status: 1, category: 1, name: 1 }, { name: "vendors_category" });
  await db.collection("vendors").createIndex({ weddingId: 1, eventIds: 1, status: 1 }, { name: "vendors_events" });
}
