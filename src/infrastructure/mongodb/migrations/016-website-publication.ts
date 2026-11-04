import type { Db } from "mongodb";
/** Publication schema/index activation. No application records or allowances change. */
export async function migrateWebsitePublication(db: Db) {
  const weddingInfo = await db.listCollections({ name: "weddings" }, { nameOnly: false }).next();
  const assetInfo = await db.listCollections({ name: "assets" }, { nameOnly: false }).next();
  const weddings = weddingInfo?.options?.validator, existing = assetInfo?.options?.validator;
  if (!weddings?.$jsonSchema?.properties?.publicPage?.properties?.draft?.properties?.contact || !(existing?.$jsonSchema || existing?.$or?.[0]?.$jsonSchema)) throw Error("Migrations 008 and 015 required.");
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" }, text = { bsonType: "string" }, integer = { bsonType: ["int", "long", "double"], minimum: 0, multipleOf: 1 };
  const page = weddings.$jsonSchema.properties.publicPage.properties;
  const contact = weddings.$jsonSchema.properties.publicPage.properties.draft.properties.contact;
  page.publishedAt = date; page.publishedDraftVersion = integer; page.publishedContentHash = text;
  page.snapshot = { bsonType: "object", additionalProperties: false, required: ["coupleNames", "intro", "events", "timezone"], properties: {
    coupleNames: { bsonType: "string", minLength: 1, maxLength: 403 }, intro: { bsonType: "string", maxLength: 10000 }, date: { bsonType: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }, timezone: text, contact,
    publicCoverAssetId: oid, events: { bsonType: "array", maxItems: 100, items: { bsonType: "object", additionalProperties: false, required: ["eventId", "title", "startsAt", "venue"], properties: { eventId: oid, title: text, startsAt: date, endsAt: date, venue: { bsonType: "object", additionalProperties: false, required: ["name", "address"], properties: { name: text, address: text } }, description: { bsonType: "string", maxLength: 10000 }, dressCode: text } } },
  } };
  // Preserve every existing purpose branch, including later invitation validation.
  const copy = { $jsonSchema: { bsonType: "object", required: ["weddingId", "purpose", "visibility", "state", "publicId", "sourceAssetId", "operationKey", "reservedBytes", "expiresAt", "nextCheckAt", "version", "schemaVersion", "createdAt", "updatedAt"], oneOf: [ { properties: { state: { enum: ["ready"] } }, required: ["provider", "providerAssetId", "providerVersion", "resourceType", "format", "bytes", "width", "height"] }, { properties: { state: { enum: ["preparing", "delete_pending", "deleted"] } } } ], properties: {
    weddingId: oid, purpose: { enum: ["public_copy"] }, visibility: { enum: ["public_page"] }, state: { enum: ["preparing", "ready", "delete_pending", "deleted"] }, sourceAssetId: oid, operationKey: text, publicId: { bsonType: "string", pattern: "^mmm/[a-f0-9]{24}/website/[a-f0-9]{32}$" }, reservedBytes: { bsonType: "long", minimum: 0 }, expiresAt: date, nextCheckAt: date, version: integer, schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date, deletedAt: date,
    provider: { enum: ["cloudinary"] }, providerAssetId: text, providerVersion: integer, resourceType: { enum: ["image"] }, format: { enum: ["jpg"] }, bytes: { bsonType: "long", minimum: 1 }, width: integer, height: integer,
  } } };
  const assets = existing.$or
    ? { ...existing, $or: existing.$or.some((branch: { $jsonSchema?: { properties?: { purpose?: { enum?: string[] } } } }) => branch.$jsonSchema?.properties?.purpose?.enum?.includes("public_copy")) ? existing.$or : [...existing.$or, copy] }
    : { $or: [existing, copy] };
  for (const [name, validator] of [["weddings", weddings], ["assets", assets]] as const) {
    if (await db.collection(name).findOne({ $nor: [validator] }, { projection: { _id: 1 } })) throw Error("Existing records require review before publication activation.");
  }
  // Preflight both collections before applying either validator; repeatable after interruption.
  await db.command({ collMod: "weddings", validator: weddings, validationLevel: "strict", validationAction: "error" });
  await db.command({ collMod: "assets", validator: assets, validationLevel: "strict", validationAction: "error" });
  for (const [name, key, partial] of [
    ["media_intent", { weddingId: 1, uploadIntentId: 1 }, { uploadIntentId: { $exists: true } }],
    ["media_provider", { provider: 1, providerAssetId: 1 }, { providerAssetId: { $exists: true } }],
  ] as const) {
    const index = (await db.collection("assets").indexes()).find(i => i.name === name);
    if (JSON.stringify(index?.partialFilterExpression) === JSON.stringify(partial)) continue;
    if (index) await db.collection("assets").dropIndex(name);
    await db.collection("assets").createIndex(key, { name, unique: true, partialFilterExpression: partial });
  }
  await db.collection("assets").createIndex({ weddingId: 1, operationKey: 1 }, { name: "website_copy_operation", unique: true, partialFilterExpression: { purpose: "public_copy" } });
}
