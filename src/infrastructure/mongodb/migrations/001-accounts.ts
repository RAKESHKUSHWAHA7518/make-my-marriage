import type { Db } from "mongodb";

/** Explicit, repeatable migration. Never runs implicitly on application startup. */
export async function migrateAccounts(db: Db) {
  const date = { bsonType: "date" };
  const text = { bsonType: "string" };
  const oid = { bsonType: "objectId" };
  const integer = {
    bsonType: ["int", "long", "double"],
    minimum: 0,
    multipleOf: 1,
  };
  const definitions: Record<
    string,
    { required: string[]; properties: Record<string, unknown> }
  > = {
    webhookReceipts: {
      required: [
        "provider",
        "providerEventId",
        "eventType",
        "payloadHash",
        "receivedAt",
        "state",
      ],
      properties: {
        provider: { enum: ["resend"] },
        providerEventId: text,
        eventType: text,
        payloadHash: text,
        receivedAt: date,
        nextAttemptAt: date,
        state: { enum: ["received", "processed", "failed"] },
      },
    },
    users: {
      required: [
        "email",
        "emailNormalized",
        "displayName",
        "passwordHash",
        "credentialVersion",
        "status",
      ],
      properties: {
        email: text,
        emailNormalized: text,
        displayName: { bsonType: "string", minLength: 1, maxLength: 200 },
        passwordHash: text,
        credentialVersion: integer,
        status: { enum: ["active", "disabled"] },
        emailVerifiedAt: date,
      },
    },
    sessions: {
      required: [
        "userId",
        "tokenHash",
        "credentialVersion",
        "expiresAt",
        "lastSeenAt",
      ],
      properties: {
        userId: oid,
        tokenHash: text,
        credentialVersion: integer,
        expiresAt: date,
        lastSeenAt: date,
        revokedAt: date,
      },
    },
    authTokens: {
      required: ["userId", "tokenHash", "purpose", "expiresAt"],
      properties: {
        userId: oid,
        tokenHash: text,
        purpose: { enum: ["verify_email", "reset_password"] },
        expiresAt: date,
        consumedAt: date,
        targetEmailNormalized: text,
      },
    },
    rateLimits: {
      required: ["keyHash", "action", "windowStart", "count", "expiresAt"],
      properties: {
        keyHash: text,
        action: text,
        windowStart: date,
        count: integer,
        expiresAt: date,
      },
    },
    deliveries: {
      required: [
        "kind",
        "userId",
        "recipientKey",
        "payloadHash",
        "dedupeKey",
        "submissionState",
        "version",
      ],
      properties: {
        userId: oid,
        authTokenId: oid,
        membershipInviteId: oid,
        weddingId: oid,
        kind: { enum: ["verify_email", "reset_password", "membership_invite"] },
        recipientKey: text,
        payloadHash: text,
        dedupeKey: text,
        submissionState: {
          enum: [
            "queued",
            "submitting",
            "accepted",
            "failed",
            "suppressed",
            "unknown",
          ],
        },
        payloadExpiresAt: date,
        version: integer,
      },
    },
    jobs: {
      required: [
        "kind",
        "dedupeKey",
        "payloadRef",
        "state",
        "runAt",
        "attempts",
        "maxAttempts",
      ],
      properties: {
        kind: { enum: ["email_send"] },
        dedupeKey: text,
        payloadRef: {
          bsonType: "object",
          required: ["deliveryId"],
          properties: { deliveryId: oid },
        },
        state: {
          enum: ["queued", "running", "retry", "done", "dead", "cancelled"],
        },
        runAt: date,
        attempts: integer,
        maxAttempts: integer,
        leaseUntil: date,
      },
    },
  };
  for (const [name, shape] of Object.entries(definitions)) {
    const validator = {
      $jsonSchema: {
        bsonType: "object",
        ...(name === "deliveries"
          ? {
              oneOf: [
                {
                  properties: {
                    kind: { enum: ["verify_email", "reset_password"] },
                  },
                  required: ["authTokenId"],
                },
                {
                  properties: { kind: { enum: ["membership_invite"] } },
                  required: ["membershipInviteId", "weddingId"],
                },
              ],
            }
          : {}),
        required: [
          "schemaVersion",
          "createdAt",
          "updatedAt",
          ...shape.required,
        ],
        properties: {
          schemaVersion: { enum: [1] },
          createdAt: date,
          updatedAt: date,
          ...shape.properties,
        },
      },
    };
    const exists = await db
      .listCollections({ name }, { nameOnly: true })
      .hasNext();
    if (exists)
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    else await db.createCollection(name, { validator });
  }
  await db
    .collection("webhookReceipts")
    .createIndex({ provider: 1, providerEventId: 1 }, { unique: true });
  await db
    .collection("webhookReceipts")
    .createIndex({ state: 1, receivedAt: 1 });
  await db
    .collection("webhookReceipts")
    .createIndex({ provider: 1, state: 1, nextAttemptAt: 1, receivedAt: 1 });
  await db
    .collection("webhookReceipts")
    .createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 });
  await db
    .collection("deliveries")
    .createIndex({ providerMessageId: 1 }, { sparse: true });
  await db
    .collection("users")
    .createIndex({ emailNormalized: 1 }, { unique: true });
  for (const name of ["sessions", "authTokens"]) {
    await db.collection(name).createIndex({ tokenHash: 1 }, { unique: true });
    await db.collection(name).createIndex({ userId: 1 });
    await db
      .collection(name)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }
  await db
    .collection("rateLimits")
    .createIndex({ keyHash: 1, action: 1, windowStart: 1 }, { unique: true });
  await db
    .collection("rateLimits")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  for (const name of ["jobs", "deliveries"])
    await db.collection(name).createIndex({ dedupeKey: 1 }, { unique: true });
  await db
    .collection("jobs")
    .createIndex({ kind: 1, state: 1, runAt: 1, leaseUntil: 1 });
  await db
    .collection("deliveries")
    .createIndex({ recipientKey: 1, bouncedAt: 1, complainedAt: 1 });
  await db.collection("deliveries").createIndex({ payloadExpiresAt: 1 });
  await db
    .collection("deliveries")
    .createIndex({ membershipInviteId: 1 }, { sparse: true });
}
