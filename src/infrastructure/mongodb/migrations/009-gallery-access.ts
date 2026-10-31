import type { Db } from "mongodb";

/** Extend the existing session validator without changing household grants or issuing sessions. */
export async function migrateGalleryAccess(db: Db) {
  const collection = await db.listCollections({ name: "capabilitySessions" }).next();
  const original = collection && "options" in collection ? collection.options?.validator?.$jsonSchema : undefined;
  if (!original) throw new Error("Apply migration 007 before 009");
  const schema = structuredClone(original);
  schema.required = schema.required.filter((field: string) => !["capabilityLinkId", "capabilityVersion"].includes(field));
  schema.properties.kind = { enum: ["household", "gallery"] };
  schema.properties.galleryTokenVersion = { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 };
  schema.oneOf = [
    { required: ["capabilityLinkId", "capabilityVersion"], properties: { kind: { enum: ["household"] } } },
    { required: ["galleryTokenVersion"], properties: { kind: { enum: ["gallery"] } } },
  ];
  await db.command({ collMod: "capabilitySessions", validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" });
  await db.collection("capabilitySessions").createIndex({ weddingId: 1, kind: 1, galleryTokenVersion: 1 }, { name: "capability_gallery_session" });
}
