import type { Db } from "mongodb";

/** Explicit, repeatable onboarding migration; no runtime schema creation. */
export async function migrateWeddings(db: Db) {
  const text = { bsonType: "string", minLength: 1, maxLength: 200 };
  const oid = { bsonType: "objectId" };
  const date = { bsonType: "date" };
  const integer = {
    bsonType: ["int", "long", "double"],
    minimum: 0,
    multipleOf: 1,
  };
  const money = { bsonType: "long", minimum: 0 };
  const object = (required: string[], properties: Record<string, unknown>) => ({
    bsonType: "object",
    required,
    properties,
  });
  const definitions = {
    memberships: object(
      ["userId", "weddingId", "role", "status", "joinedAt", "version"],
      {
        userId: oid,
        weddingId: oid,
        role: { enum: ["ADMIN", "MANAGER"] },
        status: { enum: ["active", "removed"] },
        joinedAt: date,
        removedAt: date,
        version: integer,
      },
    ),
    weddings: object(
      [
        "couple",
        "title",
        "timezone",
        "currency",
        "state",
        "writeFence",
        "storage",
        "privateWebsite",
        "publicPage",
        "gallery",
        "version",
        "createdBy",
      ],
      {
        couple: object(["brideName", "groomName"], {
          brideName: text,
          groomName: text,
        }),
        title: text,
        timezone: text,
        currency: { bsonType: "string", pattern: "^[A-Z]{3}$" },
        weddingDate: {
          bsonType: "string",
          pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
        },
        state: { enum: ["active", "archived"] },
        budgetMinor: money,
        writeFence: money,
        storage: object(["usedBytes", "reservedBytes", "limitBytes"], {
          usedBytes: money,
          reservedBytes: money,
          limitBytes: money,
        }),
        privateWebsite: { bsonType: "object" },
        publicPage: object(
          [
            "slug",
            "state",
            "draft",
            "draftVersion",
            "publishedRevision",
            "sourceChanged",
          ],
          {
            slug: text,
            state: { enum: ["draft", "published", "unpublished"] },
            draft: object(["coupleNames", "intro", "selectedEventIds"], {
              coupleNames: { bsonType: "string", maxLength: 403 },
              intro: { bsonType: "string", maxLength: 10000 },
              selectedEventIds: { bsonType: "array", items: oid },
            }),
            draftVersion: integer,
            publishedRevision: integer,
            sourceChanged: { bsonType: "bool" },
          },
        ),
        gallery: object(
          [
            "tokenHash",
            "encryptedSecret",
            "tokenVersion",
            "isEnabled",
            "guestUploadsEnabled",
          ],
          {
            tokenHash: text,
            encryptedSecret: object(["ciphertext", "iv", "tag", "keyVersion"], {
              ciphertext: text,
              iv: text,
              tag: text,
              keyVersion: integer,
            }),
            tokenVersion: integer,
            isEnabled: { bsonType: "bool" },
            guestUploadsEnabled: { bsonType: "bool" },
          },
        ),
        version: integer,
        createdBy: oid,
      },
    ),
    activity: object(
      [
        "weddingId",
        "actor",
        "action",
        "entityType",
        "entityId",
        "summary",
        "occurredAt",
      ],
      {
        weddingId: oid,
        actor: { bsonType: "object" },
        action: text,
        entityType: text,
        entityId: oid,
        summary: text,
        afterVersion: integer,
        occurredAt: date,
      },
    ),
    idempotencyKeys: object(
      ["scopeKey", "keyHash", "requestHash", "state", "expiresAt"],
      {
        scopeKey: text,
        keyHash: text,
        requestHash: text,
        state: { enum: ["processing", "completed"] },
        resourceType: text,
        resourceId: oid,
        responseCode: integer,
        expiresAt: date,
      },
    ),
  };
  for (const [name, shape] of Object.entries(definitions)) {
    const validator = {
      $jsonSchema: {
        ...shape,
        required: [
          ...shape.required,
          "schemaVersion",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          ...shape.properties,
          schemaVersion: { enum: [1] },
          createdAt: date,
          updatedAt: date,
        },
      },
    };
    if (await db.listCollections({ name }, { nameOnly: true }).hasNext())
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    else await db.createCollection(name, { validator });
  }
  await db
    .collection("memberships")
    .createIndex({ userId: 1 }, { unique: true });
  await db
    .collection("memberships")
    .createIndex({ weddingId: 1, status: 1, role: 1 });
  await db
    .collection("weddings")
    .createIndex({ "publicPage.slug": 1 }, { unique: true });
  await db
    .collection("weddings")
    .createIndex({ "gallery.tokenHash": 1 }, { unique: true });
  await db
    .collection("activity")
    .createIndex({ weddingId: 1, occurredAt: -1, _id: -1 });
  await db
    .collection("idempotencyKeys")
    .createIndex({ scopeKey: 1, keyHash: 1 }, { unique: true });
  await db
    .collection("idempotencyKeys")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
