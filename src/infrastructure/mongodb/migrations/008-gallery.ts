import { Long, type Db } from "mongodb";
/** Explicit activation migration. Initializes zero allowances to user-approved 1 GB; guest access remains off. */
export async function migrateGallery(db: Db) {
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" }, text = { bsonType: "string" }, integer = { bsonType: ["int", "long", "double"], minimum: 0, multipleOf: 1 };
  const common = { schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date, version: integer, weddingId: oid };
  const definitions = {
    uploadIntents: { required: ["weddingId", "actor", "expectedPublicId", "filename", "sizeBytes", "reservedBytes", "maxBytes", "state", "expiresAt", "nextCheckAt", "operationKey", "requestHash", "version"], properties: { ...common, actor: { bsonType: "object", required: ["userId", "credentialVersion"], properties: { userId: oid, credentialVersion: integer } }, purpose: { enum: ["gallery"] }, expectedPublicId: text, filename: text, sizeBytes: integer, reservedBytes: { bsonType: "long", minimum: 0 }, maxBytes: integer, state: { enum: ["reserved", "finalized", "expired", "rejected"] }, expiresAt: date, nextCheckAt: date, operationKey: text, requestHash: text, assetId: oid, reservationReleasedAt: date, finalizedAt: date } },
    assets: { required: ["weddingId", "uploadIntentId", "purpose", "provider", "providerAssetId", "publicId", "providerVersion", "resourceType", "format", "bytes", "width", "height", "visibility", "uploadedBy", "state", "version", "filename"], properties: { ...common, uploadIntentId: oid, purpose: { enum: ["gallery"] }, provider: { enum: ["cloudinary"] }, providerAssetId: text, publicId: text, providerVersion: integer, resourceType: { enum: ["image"] }, format: { enum: ["jpg", "png", "webp"] }, bytes: { bsonType: "long", minimum: 1 }, width: integer, height: integer, visibility: { enum: ["gallery"] }, uploadedBy: { bsonType: "object" }, state: { enum: ["ready", "delete_pending", "deleted"] }, filename: text, nextCheckAt: date, deletedAt: date } },
  };
  for (const [name, definition] of Object.entries(definitions)) {
    const validator = { $jsonSchema: { bsonType: "object", required: [...definition.required, "schemaVersion", "createdAt", "updatedAt"], properties: definition.properties } };
    if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
  }
  await db.collection("uploadIntents").createIndex({ "actor.userId": 1, operationKey: 1 }, { unique: true, name: "media_operation" });
  await db.collection("uploadIntents").createIndex({ expectedPublicId: 1 }, { unique: true, name: "media_target" });
  await db.collection("uploadIntents").createIndex({ state: 1, nextCheckAt: 1 }, { name: "media_reconcile" });
  await db.collection("assets").createIndex({ provider: 1, providerAssetId: 1 }, { unique: true, name: "media_provider" });
  await db.collection("assets").createIndex({ weddingId: 1, uploadIntentId: 1 }, { unique: true, name: "media_intent" });
  await db.collection("assets").createIndex({ weddingId: 1, purpose: 1, state: 1, _id: -1 }, { name: "media_gallery" });
  await db.collection("assets").createIndex({ state: 1, nextCheckAt: 1 }, { name: "media_cleanup" });
  await db.collection("weddings").updateMany({ "storage.limitBytes": Long.ZERO, $expr: { $lte: [{ $add: ["$storage.usedBytes", "$storage.reservedBytes"] }, Long.fromNumber(1_000_000_000)] } }, { $set: { "storage.limitBytes": Long.fromNumber(1_000_000_000) }, $inc: { writeFence: Long.ONE } });
}
