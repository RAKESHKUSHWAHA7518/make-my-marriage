import type { Db } from "mongodb";
/** Extend only the embedded draft validator; never rewrite wedding records. */
export async function migrateWebsiteDrafts(db: Db) {
  const info = await db.listCollections({ name: "weddings" }, { nameOnly: false }).next();
  const validator = info?.options?.validator;
  const draft = validator?.$jsonSchema?.properties?.publicPage?.properties?.draft;
  if (!draft?.properties?.selectedEventIds) throw Error("Migration 002 is required first.");
  draft.additionalProperties = false;
  draft.properties = { ...draft.properties,
    coupleNames: { bsonType: "string", minLength: 1, maxLength: 403 },
    selectedEventIds: { bsonType: "array", maxItems: 100, uniqueItems: true, items: { bsonType: "objectId" } },
    date: { bsonType: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    coverAssetId: { bsonType: "objectId" },
    contact: { bsonType: "object", additionalProperties: false, minProperties: 1, properties: { name: { bsonType: "string", minLength: 1, maxLength: 200 }, email: { bsonType: "string", minLength: 1, maxLength: 254 }, phone: { bsonType: "string", minLength: 5, maxLength: 40 } } },
  };
  if (await db.collection("weddings").findOne({ $nor: [{ $jsonSchema: validator.$jsonSchema }] }, { projection: { _id: 1 } })) throw Error("Existing wedding data does not match the extended validator; review before activation.");
  await db.command({ collMod: "weddings", validator, validationLevel: "strict", validationAction: "error" });
}
