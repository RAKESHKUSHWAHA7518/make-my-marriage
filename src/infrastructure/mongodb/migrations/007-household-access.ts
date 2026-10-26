import type { Db } from "mongodb";
/** Explicit maintenance migration. Does not issue links or sessions. */
export async function migrateHouseholdAccess(db: Db) {
  const oid = { bsonType: "objectId" }, date = { bsonType: "date" }, integer = { bsonType: ["int", "long", "double"], minimum: 1, multipleOf: 1 }, hash = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
  const common = { schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date };
  const definitions = {
    capabilityLinks: { required: ["weddingId", "kind", "subjectId", "tokenHash", "encryptedSecret", "active", "version", "createdBy"], properties: { ...common, weddingId: oid, kind: { enum: ["household"] }, subjectId: oid, tokenHash: hash, encryptedSecret: { bsonType: "object", required: ["ciphertext", "iv", "tag", "keyVersion"], properties: { ciphertext: { bsonType: "string" }, iv: { bsonType: "string" }, tag: { bsonType: "string" }, keyVersion: { enum: [1] } } }, active: { bsonType: "bool" }, version: integer, createdBy: oid, expiresAt: date, revokedAt: date } },
    capabilitySessions: { required: ["weddingId", "kind", "capabilityLinkId", "capabilityVersion", "tokenHash", "expiresAt", "lastSeenAt"], properties: { ...common, weddingId: oid, kind: { enum: ["household"] }, capabilityLinkId: oid, capabilityVersion: integer, tokenHash: hash, expiresAt: date, lastSeenAt: date, revokedAt: date } },
  };
  for (const [name, shape] of Object.entries(definitions)) {
    const validator = { $jsonSchema: { bsonType: "object", required: [...shape.required, "schemaVersion", "createdAt", "updatedAt"], properties: shape.properties } };
    if (await db.listCollections({ name }).hasNext()) await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
  }
  await db.collection("capabilityLinks").createIndex({ tokenHash: 1 }, { unique: true, name: "capability_link_token" });
  await db.collection("capabilityLinks").createIndex({ weddingId: 1, subjectId: 1 }, { unique: true, partialFilterExpression: { kind: "household", active: true }, name: "capability_household_active" });
  await db.collection("capabilityLinks").createIndex({ weddingId: 1, kind: 1, active: 1 }, { name: "capability_active" });
  await db.collection("capabilitySessions").createIndex({ tokenHash: 1 }, { unique: true, name: "capability_session_token" });
  await db.collection("capabilitySessions").createIndex({ capabilityLinkId: 1 }, { name: "capability_session_link" });
  await db.collection("capabilitySessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "capability_session_expiry" });
}
