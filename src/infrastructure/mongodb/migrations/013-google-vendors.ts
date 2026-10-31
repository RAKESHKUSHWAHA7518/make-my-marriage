import type { Db } from "mongodb";

/** Explicit extension of 012. No backfill, provider call or sample record. */
export async function migrateGoogleVendors(db: Db) {
  if (!await db.listCollections({ name: "vendors" }).hasNext()) throw Error("Migration 012 is required first.");
  const existing = await db.collection("vendors").indexes();
  if (!["vendors_operation", "vendors_list", "vendors_category", "vendors_events"].every(n => existing.some(i => i.name === n))) throw Error("Migration 012 indexes are required first.");
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" }, text = { bsonType: "string", minLength: 1, maxLength: 200 };
  const validator = { $jsonSchema: { bsonType: "object", additionalProperties: false,
    required: ["_id", "weddingId", "name", "category", "source", "eventIds", "status", "operationKey", "requestHash", "createdBy", "version", "schemaVersion", "createdAt", "updatedAt"],
    properties: {
      _id: oid, weddingId: oid, createdBy: oid, name: text,
      category: { enum: ["venue", "catering", "photography", "decoration", "mehendi", "priest", "clothing", "other"] }, source: { enum: ["MANUAL", "GOOGLE_PLACES"] },
      googlePlaceId: { bsonType: "string", minLength: 1, maxLength: 256, pattern: "^[A-Za-z0-9_-]+$" },
      contact: { bsonType: "object", additionalProperties: false, properties: { person: text, phone: { bsonType: "string", minLength: 5, maxLength: 40 }, email: { bsonType: "string", maxLength: 254 }, address: { bsonType: "string", minLength: 1, maxLength: 2000 } } },
      eventIds: { bsonType: "array", maxItems: 100, uniqueItems: true, items: oid }, notes: { bsonType: "string", maxLength: 10000 },
      status: { enum: ["active", "removed"] }, removedAt: date,
      operationKey: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, requestHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
      version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date,
    },
    oneOf: [
      { properties: { source: { enum: ["MANUAL"] } }, not: { required: ["googlePlaceId"] } },
      { properties: { source: { enum: ["GOOGLE_PLACES"] } }, required: ["googlePlaceId"] },
    ],
  } };
  await db.command({ collMod: "vendors", validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("vendors").createIndex({ weddingId: 1, googlePlaceId: 1 }, { unique: true, partialFilterExpression: { googlePlaceId: { $type: "string" } }, name: "vendors_google_place" });
}
