import type { Db } from "mongodb";

/** Explicit maintenance migration; never executed by application requests. */
export async function migrateHouseholds(db: Db) {
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" };
  const integer = { bsonType: ["int", "long", "double"], multipleOf: 1 };
  const text = { bsonType: "string", minLength: 1, maxLength: 200 };
  const validator = { $and: [
    { $jsonSchema: { bsonType: "object", required: ["weddingId", "displayName", "representative", "side", "tags", "maxGuests", "invitedEventIds", "source", "status", "rsvp", "version", "schemaVersion", "createdAt", "updatedAt"], properties: {
      weddingId: oid, displayName: text,
      representative: { bsonType: "object", required: ["name"], properties: { name: text, email: { bsonType: "string", maxLength: 254 }, emailNormalized: { bsonType: "string", maxLength: 254 }, phone: { bsonType: "string", maxLength: 40 } } },
      side: { enum: ["bride", "groom", "both", "other"] }, tags: { bsonType: "array", maxItems: 50, items: { bsonType: "string", maxLength: 100 } },
      maxGuests: { ...integer, minimum: 1, maximum: 2147483647 }, invitedEventIds: { bsonType: "array", maxItems: 100, uniqueItems: true, items: oid },
      notes: { bsonType: "string", maxLength: 10000 }, source: { enum: ["manual", "csv", "contacts"] }, status: { enum: ["active", "removed"] },
      rsvp: { bsonType: "object", required: ["status", "attendeeCount", "updatedAfterDeadline"], properties: { status: { enum: ["pending", "attending", "not_attending", "maybe"] }, attendeeCount: { ...integer, minimum: 0 }, updatedAfterDeadline: { bsonType: "bool" }, respondedAt: date, respondedBy: { bsonType: "object" } } },
      version: { ...integer, minimum: 1 }, schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date, removedAt: date,
    } } },
    { $expr: { $cond: [{ $eq: ["$rsvp.status", "attending"] }, { $and: [{ $gte: ["$rsvp.attendeeCount", 1] }, { $lte: ["$rsvp.attendeeCount", "$maxGuests"] }] }, { $eq: ["$rsvp.attendeeCount", 0] }] } },
  ] };
  if (await db.listCollections({ name: "households" }).hasNext()) await db.command({ collMod: "households", validator, validationLevel: "strict", validationAction: "error" });
  else await db.createCollection("households", { validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("households").createIndex({ weddingId: 1, status: 1, displayName: 1, _id: 1 }, { name: "households_list" });
  await db.collection("households").createIndex({ weddingId: 1, status: 1, "rsvp.status": 1 }, { name: "households_rsvp" });
  await db.collection("households").createIndex({ weddingId: 1, invitedEventIds: 1, status: 1 }, { name: "households_events" });
  await db.collection("households").createIndex({ weddingId: 1, "representative.emailNormalized": 1 }, { name: "households_email" });
  await db.collection("households").createIndex({ weddingId: 1, "representative.phone": 1 }, { name: "households_phone" });
}
