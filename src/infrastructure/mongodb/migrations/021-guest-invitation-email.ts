import type { Db, Document } from "mongodb";

export async function migrateGuestInvitationEmail(db: Db) {
  const oid = { bsonType: "objectId" };
  const date = { bsonType: "date" };
  const hash = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
  const encrypted = {
    bsonType: "object",
    required: ["ciphertext", "iv", "tag", "keyVersion"],
    properties: {
      ciphertext: { bsonType: "string", maxLength: 131072 },
      iv: { bsonType: "string" }, tag: { bsonType: "string" }, keyVersion: { enum: [1] },
    },
  };
  const ids = { bsonType: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: oid };
  const validators: [string, Document][] = [];
  for (const name of ["deliveries", "jobs"]) {
    const info = await db.listCollections({ name }, { nameOnly: false }).next();
    const validator = structuredClone(info?.options?.validator);
    const schema = validator?.$jsonSchema;
    if (!schema?.properties?.kind?.enum) throw Error("Account mail schema required");
    const kind = name === "jobs" ? "guest_invitation_send" : "guest_invitation";
    if (!schema.properties.kind.enum.includes(kind)) schema.properties.kind.enum.push(kind);
    if (name === "deliveries") {
      Object.assign(schema.properties, { campaignId: oid, householdId: oid });
      if (!schema.properties.submissionState.enum.includes("cancelled")) schema.properties.submissionState.enum.push("cancelled");
      const branch = { required: ["campaignId", "householdId", "weddingId"], properties: { kind: { enum: [kind] } } };
      if (!schema.oneOf.some((row: Document) => row.properties?.kind?.enum?.includes(kind))) schema.oneOf.push(branch);
    }
    validators.push([name, validator]);
  }
  validators.push(["emailCampaigns", { $jsonSchema: {
    bsonType: "object", additionalProperties: false,
    required: ["kind", "weddingId", "householdId", "audienceHouseholdIds", "eventIds", "createdBy", "credentialVersion", "reviewHash", "operationKey", "deliveryId", "snapshotEncrypted", "version", "schemaVersion", "createdAt", "updatedAt"],
    properties: {
      _id: oid, kind: { enum: ["invitation"] }, weddingId: oid, householdId: oid,
      audienceHouseholdIds: { ...ids, maxItems: 1 }, eventIds: ids, designVersionId: oid,
      createdBy: oid, credentialVersion: { bsonType: ["int", "long", "double"], minimum: 1 },
      reviewHash: hash, operationKey: hash, deliveryId: oid, snapshotEncrypted: encrypted,
      version: { bsonType: ["int", "long", "double"], minimum: 1 },
      schemaVersion: { enum: [1] }, createdAt: date, updatedAt: date,
    },
  } }]);
  for (const [name, validator] of validators) {
    if (await db.listCollections({ name }).hasNext() && await db.collection(name).findOne({ $nor: [validator] }, { projection: { _id: 1 } }))
      throw Error("Email schema preflight failed");
  }
  for (const [name, validator] of validators) {
    if (await db.listCollections({ name }).hasNext())
      await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    else await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" });
  }
  const campaigns = db.collection("emailCampaigns");
  await campaigns.createIndex({ weddingId: 1, householdId: 1, reviewHash: 1 }, { name: "invitation_email_review", unique: true });
  await campaigns.createIndex({ weddingId: 1, operationKey: 1 }, { name: "invitation_email_operation", unique: true });
  await campaigns.createIndex({ weddingId: 1, householdId: 1, _id: -1 }, { name: "invitation_email_history" });
}
