import "server-only";
import { Long, ObjectId } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import {
  AccountError,
  digest,
  encrypt,
  mailConfiguration,
  origin,
  privateKey,
  randomToken,
} from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "./service";
import { adminTransaction } from "./membership-admin";

const inviteSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(["ADMIN", "MANAGER"]),
});
const tokenSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
const versionSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});
const unavailable = () =>
  new AccountError(
    404,
    "INVITATION_UNAVAILABLE",
    "This invitation is no longer available. Contact a wedding administrator.",
  );
const metadata = (row: {
  _id: ObjectId;
  emailNormalized: string;
  role: string;
  state: string;
  expiresAt: Date;
  version: number;
}) => ({
  id: row._id.toString(),
  email: row.emailNormalized,
  role: row.role,
  state: row.state,
  expiresAt: row.expiresAt.toISOString(),
  version: row.version,
});

export async function inviteFamily(
  user: User,
  weddingId: string,
  payload: unknown,
) {
  const input = inviteSchema.parse(payload);
  const config = mailConfiguration();
  const db = await getDatabase();
  const indexes = await db.collection("membershipInvites").indexes();
  if (
    !indexes.some(
      (index) => index.unique && Object.keys(index.key).join() === "tokenHash",
    ) ||
    !indexes.some(
      (index) =>
        index.unique &&
        Object.keys(index.key).join() === "weddingId,emailNormalized" &&
        index.partialFilterExpression?.state === "pending",
    )
  )
    throw new Error("Membership invitation migration required");
  try {
    return await adminTransaction(
      user,
      weddingId,
      true,
      async (session, wedding) => {
        const now = new Date();
        const recipient = await db
          .collection("users")
          .findOne({ emailNormalized: input.email }, { session });
        const membership =
          recipient &&
          (await db
            .collection("memberships")
            .findOne({ userId: recipient._id }, { session }));
        if (
          membership?.status === "active" &&
          membership.weddingId.equals(wedding._id)
        )
          throw new AccountError(
            409,
            "ALREADY_MEMBER",
            "This person already has access.",
          );
        // Do not reveal an account's association with a different wedding.
        await db.collection("membershipInvites").updateMany(
          {
            weddingId: wedding._id,
            emailNormalized: input.email,
            state: "pending",
            expiresAt: { $lte: now },
          },
          {
            $set: { state: "expired", updatedAt: now },
            $inc: { version: 1 },
          },
          { session },
        );
        if (
          await db.collection("membershipInvites").findOne(
            {
              weddingId: wedding._id,
              emailNormalized: input.email,
              state: "pending",
            },
            { session },
          )
        )
          throw new AccountError(
            409,
            "INVITATION_ALREADY_PENDING",
            "There is already a pending invitation for this email.",
          );
        const raw = randomToken();
        const inviteId = new ObjectId();
        const expiresAt = new Date(now.getTime() + 7 * 86400000);
        const base = { schemaVersion: 1, createdAt: now, updatedAt: now };
        const invite = {
          _id: inviteId,
          ...base,
          weddingId: wedding._id,
          emailNormalized: input.email,
          role: input.role,
          tokenHash: digest(raw),
          expiresAt,
          state: "pending",
          invitedBy: user._id,
          version: 1,
        };
        await db.collection("membershipInvites").insertOne(invite, { session });
        const deliveryId = new ObjectId();
        const dedupeKey = `membership/${inviteId}`;
        const message = JSON.stringify({
          from: config.from,
          to: [input.email],
          subject: "Your Make My Marriage wedding invitation",
          text: `You are invited to ${wedding.title} as ${input.role}.\n\nSign in with this email address, verify it, then explicitly accept:\n${origin()}/membership-invitation#token=${raw}\n\nThis invitation expires in 7 days. If you did not expect it, you can ignore it.`,
        });
        await db.collection("deliveries").insertOne(
          {
            _id: deliveryId,
            ...base,
            kind: "membership_invite",
            userId: user._id,
            weddingId: wedding._id,
            membershipInviteId: inviteId,
            recipientKey: privateKey(input.email),
            recipientEmailEncrypted: encrypt(input.email),
            payloadEncrypted: encrypt(message),
            payloadHash: digest(message),
            payloadExpiresAt: expiresAt,
            dedupeKey,
            submissionState: "queued",
            version: 1,
          },
          { session },
        );
        await db.collection("jobs").insertOne(
          {
            ...base,
            kind: "email_send",
            dedupeKey,
            payloadRef: { deliveryId },
            state: "queued",
            runAt: now,
            attempts: 0,
            maxAttempts: 6,
          },
          { session },
        );
        await db.collection("activity").insertOne(
          {
            ...base,
            weddingId: wedding._id,
            actor: { type: "user", userId: user._id },
            action: "membership.invited",
            entityType: "membershipInvite",
            entityId: inviteId,
            summary: "Family invitation created",
            afterVersion: 1,
            occurredAt: now,
          },
          { session },
        );
        return { ...metadata(invite), emailSubmission: "queued" };
      },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new AccountError(
        409,
        "INVITATION_ALREADY_PENDING",
        "There is already a pending invitation for this email.",
      );
    throw error;
  }
}

export async function revokeFamilyInvitation(
  user: User,
  weddingId: string,
  inviteId: string,
  payload: unknown,
) {
  const input = versionSchema.parse(payload);
  if (!/^[a-f0-9]{24}$/.test(inviteId)) throw unavailable();
  const db = await getDatabase();
  return adminTransaction(user, weddingId, false, async (session, wedding) => {
    const now = new Date();
    const row = await db
      .collection("membershipInvites")
      .findOne(
        { _id: new ObjectId(inviteId), weddingId: wedding._id },
        { session },
      );
    if (!row) throw unavailable();
    if (row.version !== input.expectedVersion)
      throw new AccountError(
        409,
        "VERSION_CONFLICT",
        "This invitation changed. Reload the latest invitations before retrying.",
      );
    if (row.state !== "pending")
      throw new AccountError(
        409,
        "INVITATION_NOT_PENDING",
        "Only a pending invitation can be revoked.",
      );
    await db
      .collection("membershipInvites")
      .updateOne(
        { _id: row._id, version: input.expectedVersion },
        { $set: { state: "revoked", updatedAt: now }, $inc: { version: 1 } },
        { session },
      );
    const delivery = await db
      .collection("deliveries")
      .findOne({ membershipInviteId: row._id }, { session });
    if (delivery) {
      await db.collection("jobs").updateMany(
        {
          "payloadRef.deliveryId": delivery._id,
          state: { $in: ["queued", "retry"] },
        },
        { $set: { state: "cancelled", updatedAt: now } },
        { session },
      );
      await db.collection("deliveries").updateOne(
        { _id: delivery._id, submissionState: "queued" },
        {
          $set: { submissionState: "suppressed", updatedAt: now },
          $unset: { payloadEncrypted: "", recipientEmailEncrypted: "" },
        },
        { session },
      );
    }
    await db.collection("activity").insertOne(
      {
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        weddingId: wedding._id,
        actor: { type: "user", userId: user._id },
        action: "membership.invitation_revoked",
        entityType: "membershipInvite",
        entityId: row._id,
        summary: "Family invitation revoked",
        afterVersion: row.version + 1,
        occurredAt: now,
      },
      { session },
    );
    return metadata({
      ...row,
      state: "revoked",
      version: row.version + 1,
    } as Parameters<typeof metadata>[0]);
  });
}

export async function inspectInvitation(user: User, payload: unknown) {
  const { token } = tokenSchema.parse(payload);
  const db = await getDatabase();
  const row = await db
    .collection("membershipInvites")
    .findOne({ tokenHash: digest(token) });
  if (!row) throw unavailable();
  if (row.emailNormalized !== user.emailNormalized)
    throw new AccountError(
      403,
      "INVITATION_EMAIL_MISMATCH",
      "This invitation is for another email. Sign in with the invited address.",
    );
  if (!user.emailVerifiedAt)
    throw new AccountError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Verify your email to continue.",
    );
  if (row.state === "accepted" && row.acceptedBy?.equals(user._id)) {
    const access = await membershipFor(user);
    if (access?.status === "active" && access.weddingId.equals(row.weddingId))
      return {
        title: "Your wedding",
        role: access.role as string,
        alreadyJoined: true,
      };
    throw new AccountError(
      403,
      "ACCESS_REMOVED",
      "Your wedding access was removed. Ask an administrator for a fresh invitation to the same wedding.",
    );
  }
  if (row.state !== "pending") throw unavailable();
  if (row.expiresAt <= new Date())
    throw new AccountError(
      410,
      "INVITATION_EXPIRED",
      "This invitation has expired. Ask a wedding administrator for a new invitation.",
    );
  const wedding = await db
    .collection("weddings")
    .findOne({ _id: row.weddingId });
  if (!wedding) throw unavailable();
  if (wedding.state !== "active")
    throw new AccountError(
      409,
      "WEDDING_ARCHIVED",
      "This wedding is archived. New invitations cannot be accepted.",
    );
  const access = await membershipFor(user);
  if (access && !access.weddingId.equals(row.weddingId))
    throw new AccountError(
      409,
      "WEDDING_ALREADY_EXISTS",
      "Each account can belong to only one wedding. This invitation cannot move your account to another wedding.",
    );
  return {
    title: wedding.title as string,
    role: row.role as string,
    alreadyJoined: access?.status === "active",
  };
}

export async function acceptInvitation(user: User, payload: unknown) {
  const { token } = tokenSchema.parse(payload);
  const db = await getDatabase();
  const found = await db
    .collection("membershipInvites")
    .findOne({ tokenHash: digest(token) });
  if (!found) throw unavailable();
  try {
    return await db.client.withSession((session) =>
      session.withTransaction(
        async () => {
          const now = new Date();
          const wedding = await db
            .collection("weddings")
            .findOneAndUpdate(
              { _id: found.weddingId, state: "active" },
              { $inc: { writeFence: Long.ONE } },
              { session, returnDocument: "after" },
            );
          if (!wedding)
            throw new AccountError(
              409,
              "WEDDING_ARCHIVED",
              "This wedding is archived. New invitations cannot be accepted.",
            );
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
          if (actor.emailNormalized !== found.emailNormalized)
            throw new AccountError(
              403,
              "INVITATION_EMAIL_MISMATCH",
              "Sign in with the invited email address.",
            );
          if (!actor.emailVerifiedAt)
            throw new AccountError(
              403,
              "EMAIL_NOT_VERIFIED",
              "Verify your email to continue.",
            );
          const invite = await db
            .collection("membershipInvites")
            .findOne({ _id: found._id, tokenHash: digest(token) }, { session });
          if (!invite) throw unavailable();
          const membership = await db
            .collection("memberships")
            .findOne({ userId: user._id }, { session });
          if (
            invite.state === "accepted" &&
            invite.acceptedBy?.equals(user._id) &&
            membership?.status === "active" &&
            membership.weddingId.equals(wedding._id)
          )
            return { weddingId: wedding._id.toString(), role: membership.role };
          if (invite.state !== "pending") throw unavailable();
          if (invite.expiresAt <= now)
            throw new AccountError(
              410,
              "INVITATION_EXPIRED",
              "This invitation has expired.",
            );
          if (membership && !membership.weddingId.equals(wedding._id))
            throw new AccountError(
              409,
              "WEDDING_ALREADY_EXISTS",
              "Each account can belong to only one wedding.",
            );
          if (membership?.status === "active")
            throw new AccountError(
              409,
              "ALREADY_MEMBER",
              "You already have access. Open your wedding.",
            );
          const base = { schemaVersion: 1, updatedAt: now };
          if (membership)
            await db.collection("memberships").updateOne(
              { _id: membership._id, status: "removed" },
              {
                $set: {
                  status: "active",
                  role: invite.role,
                  joinedAt: now,
                  updatedAt: now,
                },
                $unset: { removedAt: "" },
                $inc: { version: 1 },
              },
              { session },
            );
          else
            await db.collection("memberships").insertOne(
              {
                ...base,
                createdAt: now,
                weddingId: wedding._id,
                userId: user._id,
                status: "active",
                role: invite.role,
                joinedAt: now,
                version: 1,
              },
              { session },
            );
          await db.collection("membershipInvites").updateOne(
            { _id: invite._id, state: "pending", version: invite.version },
            {
              $set: {
                state: "accepted",
                acceptedBy: user._id,
                acceptedAt: now,
                updatedAt: now,
              },
              $inc: { version: 1 },
            },
            { session },
          );
          await db.collection("activity").insertOne(
            {
              ...base,
              createdAt: now,
              weddingId: wedding._id,
              actor: { type: "user", userId: user._id },
              action: "membership.joined",
              entityType: "membershipInvite",
              entityId: invite._id,
              summary: "Family invitation accepted",
              occurredAt: now,
            },
            { session },
          );
          return { weddingId: wedding._id.toString(), role: invite.role };
        },
        { writeConcern: { w: "majority" } },
      ),
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new AccountError(
        409,
        "WEDDING_ALREADY_EXISTS",
        "Each account can belong to only one wedding.",
      );
    throw error;
  }
}
