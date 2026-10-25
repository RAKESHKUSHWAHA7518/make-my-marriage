import type { Db } from "mongodb";

/** Explicit migration. Never called from application requests. */
export async function migrateEvents(db: Db) {
  const text = { bsonType: "string", minLength: 1, maxLength: 200 };
  const validator = { $jsonSchema: {
    bsonType: "object",
    required: ["weddingId", "name", "type", "startsAt", "venue", "schedule", "status", "version", "createdBy", "createdAt", "updatedAt", "schemaVersion"],
    properties: {
      weddingId: { bsonType: "objectId" }, createdBy: { bsonType: "objectId" },
      name: text, type: { enum: ["haldi", "mehendi", "sangeet", "wedding", "reception", "pre_wedding", "post_wedding", "custom"] },
      startsAt: { bsonType: "date" }, endsAt: { bsonType: "date" },
      venue: { bsonType: "object", required: ["name", "address"], properties: { name: text, address: text, mapUrl: { bsonType: "string", maxLength: 2000, pattern: "^https://" } } },
      description: { bsonType: "string", maxLength: 10000 }, dressCode: text,
      schedule: { bsonType: "array", maxItems: 100, items: { bsonType: "object" } },
      status: { enum: ["draft", "scheduled", "completed", "cancelled", "removed"] },
      version: { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 },
      schemaVersion: { enum: [1] }, createdAt: { bsonType: "date" }, updatedAt: { bsonType: "date" },
    },
  } };
  if ((await db.listCollections({ name: "events" }).toArray()).length)
    await db.command({ collMod: "events", validator, validationLevel: "strict", validationAction: "error" });
  else await db.createCollection("events", { validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("events").createIndex({ weddingId: 1, startsAt: 1, _id: 1 }, { name: "events_chronological" });
  await db.collection("events").createIndex({ weddingId: 1, status: 1, startsAt: 1, _id: 1 }, { name: "events_status_chronological" });
}
