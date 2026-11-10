import type { Db } from "mongodb";
/** Explicit activation only. No records, backfills, storage allowance or publication changes. */
export async function migrateInvitationDrafts(db: Db) {
  const assetsInfo = await db.listCollections({ name: "assets" }, { nameOnly: false }).next(), intentsInfo = await db.listCollections({ name: "uploadIntents" }, { nameOnly: false }).next();
  const existingAssets = assetsInfo?.options?.validator, intents = structuredClone(intentsInfo?.options?.validator);
  if (!existingAssets?.$or?.[0]?.$jsonSchema || !intents?.$jsonSchema) throw Error("Gallery/public-copy migrations are required.");
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" }, integer = { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, text = (max: number, min = 0) => ({ bsonType: "string", minLength: min, maxLength: max }), ids = { bsonType: "array", maxItems: 100, uniqueItems: true, items: oid };
  const assetBranch = structuredClone(existingAssets.$or[0]);
  assetBranch.$jsonSchema.properties.purpose = { enum: ["invitation"] }; assetBranch.$jsonSchema.properties.visibility = { enum: ["family"] }; assetBranch.$jsonSchema.properties.audienceEventIds = ids; assetBranch.$jsonSchema.properties.orphanAfter = date;
  assetBranch.$jsonSchema.properties.uploadedBy = { bsonType: "object", required: ["type", "userId", "credentialVersion"], properties: { type: { enum: ["user"] }, userId: oid, credentialVersion: integer } };
  assetBranch.$jsonSchema.required = [...assetBranch.$jsonSchema.required, "audienceEventIds", "orphanAfter"];
  const assets = { ...existingAssets, $or: [...existingAssets.$or.filter((branch: { $jsonSchema?: { properties?: { purpose?: { enum?: string[] } } } }) => !branch.$jsonSchema?.properties?.purpose?.enum?.includes("invitation")), assetBranch] };
  const schema = intents.$jsonSchema;
  const hasTaskAttachments = schema.properties.purpose.enum.includes("task_attachment") && schema.properties.taskId && schema.properties.attachmentFormat;
  if (!hasTaskAttachments) {
    schema.properties.purpose = { enum: ["gallery", "invitation"] }; schema.properties.audienceEventIds = ids;
    const condition = { oneOf: [{ properties: { purpose: { enum: ["gallery"] } } }, { required: ["audienceEventIds"], properties: { purpose: { enum: ["invitation"] }, actor: { required: ["userId", "credentialVersion"], properties: { type: { enum: ["user"] } } } } }] };
    if (schema.allOf && JSON.stringify(schema.allOf) !== JSON.stringify([condition])) throw Error("Existing upload rules require review before activation.");
    schema.allOf = [condition];
  }
  const draft = { bsonType: "object", oneOf: [
    { additionalProperties: false, required: ["templateKey", "textFields", "assetIds", "layout"], properties: { templateKey: { enum: ["elegant", "modern", "soft"] }, assetIds: { bsonType: "array", maxItems: 0 }, textFields: { bsonType: "object", additionalProperties: false, required: ["heading", "coupleNames", "message", "closing"], properties: { heading: text(200, 1), coupleNames: text(403, 1), message: text(10000, 1), closing: text(1000) } }, layout: { bsonType: "object", additionalProperties: false, required: ["palette", "font"], properties: { palette: { enum: ["burgundy", "ivory", "sage", "rose"] }, font: { enum: ["playfair", "classic", "modern"] } } } } },
    { additionalProperties: false, required: ["assetIds"], properties: { assetIds: { bsonType: "array", minItems: 1, maxItems: 1, items: { bsonType: "string", pattern: "^[a-f0-9]{24}$" } } } },
  ] };
  const designs = { $jsonSchema: { bsonType: "object", additionalProperties: false, required: ["weddingId", "name", "mode", "eventIds", "eventVersions", "draft", "version", "createdBy", "operationKey", "createRequestHash", "createdAt", "updatedAt", "schemaVersion"], properties: { _id: oid, weddingId: oid, name: text(200, 1), mode: { enum: ["template", "uploaded_image"] }, eventIds: ids, eventVersions: { bsonType: "array", maxItems: 100, items: { bsonType: "object", additionalProperties: false, required: ["eventId", "version"], properties: { eventId: oid, version: integer } } }, draft, version: integer, createdBy: oid, operationKey: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, createRequestHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, createdAt: date, updatedAt: date, schemaVersion: { enum: [1] } }, oneOf: [{ properties: { mode: { enum: ["template"] }, draft: { required: ["templateKey"] } } }, { properties: { mode: { enum: ["uploaded_image"] }, draft: { properties: { assetIds: { minItems: 1 } } } } }] } };
  const existingDesigns = (await db.listCollections({ name: "designs" }, { nameOnly: false }).next())?.options?.validator;
  // A later migration owns the extended publication schema. Never downgrade it on a full rerun.
  const designValidator = existingDesigns?.$jsonSchema?.properties?.latestPublishedVersionId ? existingDesigns : designs;
  for (const [name, validator] of [["assets", assets], ["uploadIntents", intents], ["designs", designValidator]] as const) if (await db.listCollections({ name }).hasNext() && await db.collection(name).findOne({ $nor: [validator] }, { projection: { _id: 1 } })) throw Error("Existing data needs review before invitation activation.");
  for (const [name, validator] of [["assets", assets], ["uploadIntents", intents], ["designs", designValidator]] as const) { if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" }); else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" }); }
  await db.collection("assets").createIndex({ purpose: 1, state: 1, orphanAfter: 1 }, { name: "invitation_orphans", partialFilterExpression: { purpose: "invitation" } });
  await db.collection("designs").createIndex({ weddingId: 1, updatedAt: -1, _id: -1 }, { name: "designs_list" });
  await db.collection("designs").createIndex({ weddingId: 1, operationKey: 1 }, { name: "designs_operation", unique: true });
}
