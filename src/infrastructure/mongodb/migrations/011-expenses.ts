import type { Db } from "mongodb";

/** Explicit migration only. Never called by web requests. */
export async function migrateExpenses(db: Db) {
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" };
  const validator = { $jsonSchema: { bsonType: "object", additionalProperties: false,
    required: ["_id", "weddingId", "title", "amountMinor", "currency", "expenseDate", "category", "receiptAssetIds", "operationKey", "requestHash", "createdBy", "version", "schemaVersion", "createdAt", "updatedAt"],
    properties: {
      _id: oid, weddingId: oid, createdBy: oid, eventId: oid, vendorId: oid,
      title: { bsonType: "string", minLength: 1, maxLength: 200 }, amountMinor: { bsonType: "long", minimum: 1 },
      currency: { enum: ["INR", "USD", "GBP", "EUR", "AUD", "CAD", "SGD", "AED"] }, expenseDate: date,
      category: { enum: ["venue", "food", "decoration", "clothing", "other"] }, notes: { bsonType: "string", maxLength: 10000 },
      receiptAssetIds: { bsonType: "array", maxItems: 20, uniqueItems: true, items: oid },
      operationKey: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, requestHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
      version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, schemaVersion: { enum: [1] },
      createdAt: date, updatedAt: date, deletedAt: date,
    },
  } };
  if (await db.listCollections({ name: "expenses" }).hasNext()) await db.command({ collMod: "expenses", validator, validationLevel: "strict", validationAction: "error" });
  else await db.createCollection("expenses", { validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("expenses").createIndex({ weddingId: 1, operationKey: 1 }, { unique: true, name: "expenses_operation" });
  await db.collection("expenses").createIndex({ weddingId: 1, deletedAt: 1, expenseDate: -1, _id: -1 }, { name: "expenses_date" });
  await db.collection("expenses").createIndex({ weddingId: 1, category: 1, deletedAt: 1, expenseDate: -1 }, { name: "expenses_category" });
  await db.collection("expenses").createIndex({ weddingId: 1, eventId: 1, deletedAt: 1, expenseDate: -1 }, { name: "expenses_event" });
}
