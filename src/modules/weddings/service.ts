import "server-only";
import { Long, ObjectId, type Document } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import {
  AccountError,
  digest,
  encrypt,
  randomToken,
} from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { createWeddingSchema } from "./schema";

const fail = (code: string, message: string) =>
  new AccountError(409, code, message);
export async function membershipFor(user: User) {
  return (await getDatabase())
    .collection("memberships")
    .findOne({ userId: user._id });
}
function summary(row: Document) {
  return {
    id: row._id.toString(),
    title: row.title as string,
    state: row.state as string,
    publicPage: {
      slug: row.publicPage.slug as string,
      state: row.publicPage.state as string,
    },
    version: row.version as number,
  };
}
export async function weddingFor(user: User, id?: string) {
  const db = await getDatabase();
  const membership = await membershipFor(user);
  if (!membership || membership.status !== "active") {
    if (id) throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
    return null;
  }
  if (id && membership.weddingId.toString() !== id)
    throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
  const row = await db
    .collection("weddings")
    .findOne({ _id: membership.weddingId });
  if (!row) throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
  return {
    ...summary(row),
    couple: row.couple as { brideName: string; groomName: string },
    timezone: row.timezone as string,
    currency: row.currency as string,
    weddingDate: row.weddingDate as string | undefined,
    budgetMinor: row.budgetMinor?.toString() as string | undefined,
    role: membership.role as "ADMIN" | "MANAGER",
    gallery: { isEnabled: row.gallery.isEnabled as boolean },
  };
}
export async function currentWedding(user: User) {
  const row = await weddingFor(user);
  return row
    ? {
        id: row.id,
        title: row.title,
        state: row.state,
        publicPage: row.publicPage,
        version: row.version,
      }
    : null;
}

async function ensureIndexes() {
  const db = await getDatabase();
  for (const [collection, fields] of [
    ["memberships", ["userId"]],
    ["weddings", ["publicPage.slug"]],
    ["weddings", ["gallery.tokenHash"]],
    ["idempotencyKeys", ["scopeKey", "keyHash"]],
  ] as const) {
    const indexes = await db.collection(collection).indexes();
    if (
      !indexes.some(
        (index) =>
          index.unique && Object.keys(index.key).join() === fields.join(),
      )
    )
      throw new Error("Wedding migration required");
  }
}

export async function createWedding(
  user: User,
  payload: unknown,
  key: string | null,
) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw new AccountError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key is required.",
    );
  const input = createWeddingSchema.parse(payload);
  await ensureIndexes();
  const db = await getDatabase();
  const scopeKey = `user:${user._id}:weddings:create`;
  const keyHash = digest(key);
  const requestHash = digest(JSON.stringify(input));
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = db.client.startSession();
    try {
      return await session.withTransaction(
        async () => {
          const now = new Date();
          // Serialize creation against credential revocation and account disabling.
          const actor = await db.collection<User>("users").findOneAndUpdate(
            {
              _id: user._id,
              status: "active",
              credentialVersion: user.credentialVersion,
            },
            { $set: { updatedAt: now } },
            { session, returnDocument: "after" },
          );
          if (!actor)
            throw new AccountError(
              401,
              "UNAUTHENTICATED",
              "Please sign in again.",
            );
          if (!actor.emailVerifiedAt)
            throw new AccountError(
              403,
              "EMAIL_NOT_VERIFIED",
              "Verify your email before creating a wedding.",
            );
          const membership = await db
            .collection("memberships")
            .findOne({ userId: user._id }, { session });
          const previous = await db
            .collection("idempotencyKeys")
            .findOne({ scopeKey, keyHash }, { session });
          if (previous) {
            if (previous.requestHash !== requestHash)
              throw fail(
                "IDEMPOTENCY_CONFLICT",
                "This submission key was already used for different details.",
              );
            if (
              !membership ||
              membership.status !== "active" ||
              !membership.weddingId.equals(previous.resourceId)
            )
              throw new AccountError(
                403,
                "ACCESS_REMOVED",
                "Wedding access is unavailable. Contact a wedding administrator.",
              );
            const wedding = await db
              .collection("weddings")
              .findOne({ _id: previous.resourceId }, { session });
            if (!wedding) throw new Error("Missing wedding");
            return summary(wedding);
          }
          if (membership)
            throw fail(
              membership.status === "removed"
                ? "ACCESS_REMOVED"
                : "WEDDING_ALREADY_EXISTS",
              membership.status === "removed"
                ? "Wedding access is unavailable. Contact a wedding administrator."
                : "You already belong to a wedding. Open it from your account.",
            );
          const base = { schemaVersion: 1, createdAt: now, updatedAt: now };
          const token = randomToken();
          const slugBase =
            `${input.couple.brideName}-${input.couple.groomName}`
              .normalize("NFKD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 70) || "wedding";
          const row = {
            _id: new ObjectId(),
            ...base,
            ...input,
            ...(input.budgetMinor !== undefined
              ? { budgetMinor: Long.fromString(input.budgetMinor) }
              : {}),
            state: "active",
            writeFence: Long.ZERO,
            storage: {
              usedBytes: Long.ZERO,
              reservedBytes: Long.ZERO,
              limitBytes: Long.ZERO,
            },
            privateWebsite: {},
            publicPage: {
              slug:
                attempt === 0
                  ? slugBase
                  : `${slugBase}-${randomToken().slice(0, 10).toLowerCase()}`,
              state: "unpublished",
              draft: {
                coupleNames: `${input.couple.brideName} & ${input.couple.groomName}`,
                intro: "",
                selectedEventIds: [],
              },
              draftVersion: 1,
              publishedRevision: 0,
              sourceChanged: false,
            },
            gallery: {
              tokenHash: digest(token),
              encryptedSecret: encrypt(token, "CAPABILITY_ENCRYPTION_KEY"),
              tokenVersion: 1,
              isEnabled: false,
              guestUploadsEnabled: false,
            },
            version: 1,
            createdBy: user._id,
          };
          await db.collection("weddings").insertOne(row, { session });
          await db.collection("memberships").insertOne(
            {
              ...base,
              userId: user._id,
              weddingId: row._id,
              role: "ADMIN",
              status: "active",
              joinedAt: now,
              version: 1,
            },
            { session },
          );
          await db.collection("activity").insertOne(
            {
              ...base,
              weddingId: row._id,
              actor: { type: "user", userId: user._id },
              action: "wedding.created",
              entityType: "wedding",
              entityId: row._id,
              summary: "Wedding workspace created",
              afterVersion: 1,
              occurredAt: now,
            },
            { session },
          );
          await db.collection("idempotencyKeys").insertOne(
            {
              ...base,
              scopeKey,
              keyHash,
              requestHash,
              state: "completed",
              resourceType: "wedding",
              resourceId: row._id,
              responseCode: 201,
              expiresAt: new Date(now.getTime() + 7 * 86400000),
            },
            { session },
          );
          return summary(row);
        },
        { writeConcern: { w: "majority" } },
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000 || attempt === 2)
        throw error;
    } finally {
      await session.endSession();
    }
  }
  throw new Error("Wedding creation unavailable");
}
