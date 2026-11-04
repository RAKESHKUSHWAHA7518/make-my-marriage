import type { Db, Document } from "mongodb";

/** Explicit activation; never run from a request. No publication, assignment or media backfill. */
export async function migrateInvitationPublication(db: Db) {
  const designs = structuredClone((await db.listCollections({ name: "designs" }, { nameOnly: false }).next())?.options?.validator);
  const households = structuredClone((await db.listCollections({ name: "households" }, { nameOnly: false }).next())?.options?.validator);
  if (!designs?.$jsonSchema?.properties?.draft || !households?.$and?.[0]?.$jsonSchema) throw Error("Invitation drafts and households must be activated first.");
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" }, positive = { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, hash = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
  designs.$jsonSchema.properties.latestPublishedVersionId = oid;
  households.$and[0].$jsonSchema.properties.designVersionId = oid;
  const p = designs.$jsonSchema.properties;
  const versions = { $jsonSchema: { bsonType: "object", additionalProperties: false, required: ["weddingId", "designId", "revision", "eventIds", "content", "publishedBy", "sourceVersion", "operationKey", "requestHash", "schemaVersion", "createdAt", "updatedAt"], properties: {
    _id: oid, weddingId: oid, designId: oid, revision: positive, eventIds: p.eventIds,
    content: { bsonType: "object", additionalProperties: false, required: ["name", "mode", "eventIds", "draft"], properties: { name: p.name, mode: p.mode, eventIds: { bsonType: "array", maxItems: 100, uniqueItems: true, items: { bsonType: "string", pattern: "^[a-f0-9]{24}$" } }, draft: p.draft }, oneOf: designs.$jsonSchema.oneOf },
    publishedBy: oid, sourceVersion: positive, operationKey: hash, requestHash: hash, schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date,
  } }, $expr: { $setEquals: [{ $map: { input: "$eventIds", as: "event", in: { $toString: "$$event" } } }, "$content.eventIds"] } };
  const validators: [string, Document][] = [["designs", designs], ["households", households], ["designVersions", versions]];
  for (const [name, validator] of validators) if (await db.listCollections({ name }).hasNext() && await db.collection(name).findOne({ $nor: [validator] }, { projection: { _id: 1 } })) throw Error("Existing records need review before invitation publication activation.");
  for (const [name, validator] of validators) {
    if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
  }
  await db.collection("designVersions").createIndex({ weddingId: 1, designId: 1, revision: 1 }, { unique: true, name: "design_version_revision" });
  await db.collection("designVersions").createIndex({ weddingId: 1, operationKey: 1 }, { unique: true, name: "design_version_operation" });
  await db.collection("designVersions").createIndex({ weddingId: 1, "content.draft.assetIds": 1 }, { name: "design_version_assets" });
}
