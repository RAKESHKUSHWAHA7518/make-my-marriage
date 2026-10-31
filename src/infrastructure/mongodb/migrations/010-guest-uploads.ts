import type { Db } from "mongodb";

/** Extend upload actors only; do not enable uploads or create media/session records. */
export async function migrateGuestUploads(db: Db) {
  const collection = await db.listCollections({ name: "uploadIntents" }).next();
  const original = collection && "options" in collection ? collection.options?.validator?.$jsonSchema : undefined;
  if (!original) throw new Error("Apply migration 008 before 010");
  const schema = structuredClone(original);
  const oid = { bsonType: "objectId" }, integer = { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 };
  schema.properties.actor = { bsonType: "object", properties: { type: { enum: ["user", "gallery", "household"] }, userId: oid, credentialVersion: integer, capabilitySessionId: oid }, oneOf: [
    { required: ["userId", "credentialVersion"], properties: { type: { enum: ["user"] } } },
    { required: ["type", "capabilitySessionId"], properties: { type: { enum: ["gallery", "household"] } } },
  ] };
  schema.properties.capabilitySessionId = oid; schema.properties.capabilityLinkId = oid;
  schema.properties.capabilityVersion = integer; schema.properties.galleryTokenVersion = integer;
  schema.oneOf = [
    { properties: { actor: { properties: { type: { enum: ["user"] } }, required: ["userId", "credentialVersion"] } } },
    { required: ["capabilitySessionId", "galleryTokenVersion"], properties: { actor: { properties: { type: { enum: ["gallery"] } }, required: ["type", "capabilitySessionId"] } } },
    { required: ["capabilitySessionId", "capabilityLinkId", "capabilityVersion"], properties: { actor: { properties: { type: { enum: ["household"] } }, required: ["type", "capabilitySessionId"] } } },
  ];
  await db.command({ collMod: "uploadIntents", validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" });
  // operationKey is additionally bound to session ID, so the existing family index remains safe.
  await db.collection("uploadIntents").createIndex({ "actor.capabilitySessionId": 1, operationKey: 1 }, { unique: true, name: "media_guest_operation", partialFilterExpression: { "actor.capabilitySessionId": { $exists: true } } });
}
