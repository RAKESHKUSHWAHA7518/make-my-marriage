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
import { createWeddingSchema, patchWeddingSchema } from "./schema";

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
    currencyLocked: !!(await db
      .collection("expenses")
      .findOne({ weddingId: row._id }, { projection: { _id: 1 } })),
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

export async function updateWedding(user: User, id: string, payload: unknown) {
  const input = patchWeddingSchema.parse(payload);
  const db = await getDatabase();
  const membership = await membershipFor(user);
  if (
    !membership ||
    membership.status !== "active" ||
    membership.weddingId.toString() !== id
  )
    throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
  const session = db.client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const now = new Date();
        // All future expense writes and archive actions must take this same fence.
        const wedding = await db
          .collection("weddings")
          .findOneAndUpdate(
            { _id: membership.weddingId, state: "active" },
            { $inc: { writeFence: Long.ONE } },
            { session, returnDocument: "after" },
          );
        if (!wedding)
          throw fail(
            "WEDDING_ARCHIVED",
            "This wedding is archived. Wedding details cannot be edited.",
          );
        const actor = await db
          .collection<User>("users")
          .findOneAndUpdate(
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
        const access = await db
          .collection("memberships")
          .findOneAndUpdate(
            {
              _id: membership._id,
              userId: user._id,
              weddingId: wedding._id,
              status: "active",
              role: { $in: ["ADMIN", "MANAGER"] },
            },
            { $set: { updatedAt: now } },
            { session, returnDocument: "after" },
          );
        if (!access)
          throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
        if (wedding.version !== input.expectedVersion)
          throw Object.assign(
            fail(
              "VERSION_CONFLICT",
              "These details were updated by someone else. Reload the latest details before saving again.",
            ),
            { currentVersion: wedding.version },
          );
        if (
          input.currency &&
          input.currency !== wedding.currency &&
          (await db
            .collection("expenses")
            .findOne(
              { weddingId: wedding._id },
              { session, projection: { _id: 1 } },
            ))
        )
          throw fail(
            "CURRENCY_LOCKED",
            "Currency is locked because an expense has been recorded.",
          );
        const changes: Document = { updatedAt: now };
        const unset: Document = {};
        for (const key of [
          "couple",
          "title",
          "timezone",
          "currency",
          "weddingDate",
          "budgetMinor",
        ] as const) {
          const value = input[key];
          if (value === null) unset[key] = "";
          else if (value !== undefined)
            changes[key] =
              key === "budgetMinor" ? Long.fromString(value as string) : value;
        }
        if (input.couple || input.weddingDate !== undefined)
          changes["publicPage.sourceChanged"] = true;
        const updated = await db
          .collection("weddings")
          .findOneAndUpdate(
            { _id: wedding._id, version: input.expectedVersion },
            {
              $set: changes,
              $inc: { version: 1 },
              ...(Object.keys(unset).length ? { $unset: unset } : {}),
            },
            { session, returnDocument: "after" },
          );
        if (!updated)
          throw fail(
            "VERSION_CONFLICT",
            "Reload the latest details before saving again.",
          );
        await db.collection("activity").insertOne(
          {
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
            weddingId: wedding._id,
            actor: { type: "user", userId: user._id },
            action: "wedding.updated",
            entityType: "wedding",
            entityId: wedding._id,
            summary: "Wedding details updated",
            beforeVersion: wedding.version,
            afterVersion: updated.version,
            occurredAt: now,
          },
          { session },
        );
        return summary(updated);
      },
      { writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
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
