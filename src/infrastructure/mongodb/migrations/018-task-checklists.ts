import type { Db } from "mongodb";
/** Tighten only task checklist validation and add durable retry identity; no record backfill. */
export async function migrateTaskChecklists(db: Db) {
  const info = await db.listCollections({ name: "tasks" }, { nameOnly: false }).next(), validator = info?.options?.validator;
  if (!validator?.$jsonSchema?.properties?.checklist) throw Error("Migration 005 is required.");
  validator.$jsonSchema.properties.checklist = { bsonType: "array", maxItems: 100, items: { bsonType: "object", additionalProperties: false, required: ["id", "text", "done"], properties: { id: { bsonType: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" }, text: { bsonType: "string", minLength: 1, maxLength: 500, pattern: "\\S" }, done: { bsonType: "bool" } } } };
  validator.$jsonSchema.properties.operationKey = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
  validator.$jsonSchema.properties.createRequestHash = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
  const uniqueIds = { $eq: [{ $size: "$checklist" }, { $size: { $setUnion: [{ $map: { input: "$checklist", as: "item", in: "$$item.id" } }, []] } }] };
  if (validator.$expr && JSON.stringify(validator.$expr) !== JSON.stringify(uniqueIds)) throw Error("Existing task expression requires review before activation.");
  validator.$expr = uniqueIds;
  if (await db.collection("tasks").findOne({ $nor: [validator] }, { projection: { _id: 1 } })) throw Error("Existing task checklist data requires review before activation.");
  await db.command({ collMod: "tasks", validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("tasks").createIndex({ weddingId: 1, operationKey: 1 }, { name: "tasks_operation", unique: true, partialFilterExpression: { operationKey: { $type: "string" } } });
}
