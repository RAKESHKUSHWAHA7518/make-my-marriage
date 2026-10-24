import type { Db } from "mongodb";

export async function migrateMembershipInvites(db: Db) {
  const validator = {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "weddingId",
        "emailNormalized",
        "role",
        "tokenHash",
        "expiresAt",
        "state",
        "invitedBy",
        "version",
        "schemaVersion",
        "createdAt",
        "updatedAt",
      ],
      properties: {
        weddingId: { bsonType: "objectId" },
        emailNormalized: { bsonType: "string", minLength: 3, maxLength: 254 },
        role: { enum: ["ADMIN", "MANAGER"] },
        tokenHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
        expiresAt: { bsonType: "date" },
        state: { enum: ["pending", "accepted", "revoked", "expired"] },
        invitedBy: { bsonType: "objectId" },
        acceptedBy: { bsonType: "objectId" },
        acceptedAt: { bsonType: "date" },
        version: {
          bsonType: ["int", "long", "double"],
          minimum: 1,
          multipleOf: 1,
        },
        schemaVersion: { enum: [1] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  };
  if (
    await db
      .listCollections({ name: "membershipInvites" }, { nameOnly: true })
      .hasNext()
  )
    await db.command({
      collMod: "membershipInvites",
      validator,
      validationLevel: "strict",
      validationAction: "error",
    });
  else await db.createCollection("membershipInvites", { validator });
  const invites = db.collection("membershipInvites");
  await invites.createIndex({ tokenHash: 1 }, { unique: true });
  await invites.createIndex(
    { weddingId: 1, emailNormalized: 1 },
    { unique: true, partialFilterExpression: { state: "pending" } },
  );
  await invites.createIndex({ weddingId: 1, state: 1, _id: -1 });
  await db.collection("memberships").createIndex({ weddingId: 1, _id: -1 });
}
