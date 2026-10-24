import "server-only";
import { ObjectId, type ClientSession } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import {
  AccountError,
  SESSION_SECONDS,
  checkPassword,
  digest,
  dummyHash,
  encrypt,
  hashPassword,
  mailConfiguration,
  origin,
  privateKey,
  randomToken,
} from "./security";

export type User = {
  _id: ObjectId;
  email: string;
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  emailVerifiedAt?: Date;
  credentialVersion: number;
  status: "active" | "disabled";
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
};
type Session = {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  credentialVersion: number;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt?: Date;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
};
type AuthToken = {
  _id: ObjectId;
  userId: ObjectId;
  purpose: "verify_email" | "reset_password";
  tokenHash: string;
  targetEmailNormalized?: string;
  expiresAt: Date;
  consumedAt?: Date;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
};
export const neutral = {
  message:
    "If this address is eligible, you will receive an email with the next steps.",
};
const invalidLink = () =>
  new AccountError(
    422,
    "INVALID_TOKEN",
    "This link is invalid or expired. Please request a new one.",
  );

export async function rateLimit(action: string, signal: string, limit: number) {
  const db = await getDatabase();
  const windowStart = new Date(Math.floor(Date.now() / 900000) * 900000);
  const filter = { keyHash: privateKey(signal), action, windowStart };
  let row;
  try {
    row = await db
      .collection("rateLimits")
      .findOneAndUpdate(
        filter,
        {
          $inc: { count: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: {
            schemaVersion: 1,
            createdAt: new Date(),
            expiresAt: new Date(windowStart.getTime() + 1800000),
          },
        },
        { upsert: true, returnDocument: "after" },
      );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    row = await db
      .collection("rateLimits")
      .findOneAndUpdate(
        filter,
        { $inc: { count: 1 } },
        { returnDocument: "after" },
      );
  }
  if (!row || row.count > limit)
    throw new AccountError(
      429,
      "RATE_LIMITED",
      "Too many attempts. Please try again in 15 minutes.",
    );
}

async function queueToken(
  user: User,
  purpose: AuthToken["purpose"],
  session: ClientSession,
) {
  const db = await getDatabase();
  const raw = randomToken();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + (purpose === "verify_email" ? 86400000 : 1800000),
  );
  const authTokenId = new ObjectId();
  const deliveryId = new ObjectId();
  const config = mailConfiguration();
  const path = purpose === "verify_email" ? "verify-email" : "reset-password";
  const payload = JSON.stringify({
    from: config.from,
    to: [user.email],
    subject:
      purpose === "verify_email"
        ? "Verify your Make My Marriage email"
        : "Reset your Make My Marriage password",
    text: `Open this link to ${purpose === "verify_email" ? "verify your email" : "reset your password"}:\n${origin()}/${path}#token=${raw}\n\nIf you did not request this, you can ignore this email.`,
  });
  await db
    .collection<AuthToken>("authTokens")
    .insertOne(
      {
        _id: authTokenId,
        userId: user._id,
        purpose,
        tokenHash: digest(raw),
        targetEmailNormalized: user.emailNormalized,
        expiresAt,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
      { session },
    );
  const dedupeKey = `account/${authTokenId}`;
  await db
    .collection("deliveries")
    .insertOne(
      {
        _id: deliveryId,
        kind: purpose,
        userId: user._id,
        authTokenId,
        recipientKey: privateKey(user.emailNormalized),
        recipientEmailEncrypted: encrypt(user.email),
        payloadEncrypted: encrypt(payload),
        payloadHash: digest(payload),
        payloadExpiresAt: expiresAt,
        dedupeKey,
        submissionState: "queued",
        version: 1,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
      { session },
    );
  await db
    .collection("jobs")
    .insertOne(
      {
        kind: "email_send",
        dedupeKey,
        payloadRef: { deliveryId },
        state: "queued",
        runAt: now,
        attempts: 0,
        maxAttempts: 6,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
      { session },
    );
}

export async function register(input: {
  displayName: string;
  email: string;
  password: string;
}) {
  mailConfiguration();
  const db = await getDatabase();
  const passwordHash = await hashPassword(input.password);
  try {
    await db.client.withSession((session) =>
      session.withTransaction(async () => {
        const existing = await db
          .collection<User>("users")
          .findOne({ emailNormalized: input.email.toLowerCase() }, { session });
        if (existing) return;
        const now = new Date();
        const user: User = {
          _id: new ObjectId(),
          email: input.email,
          emailNormalized: input.email.toLowerCase(),
          displayName: input.displayName,
          passwordHash,
          credentialVersion: 1,
          status: "active",
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection<User>("users").insertOne(user, { session });
        await queueToken(user, "verify_email", session);
      }),
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  return neutral;
}

export async function requestEmail(
  email: string,
  purpose: AuthToken["purpose"],
) {
  mailConfiguration();
  const db = await getDatabase();
  await db.client.withSession((session) =>
    session.withTransaction(async () => {
      const user = await db
        .collection<User>("users")
        .findOne(
          { emailNormalized: email.toLowerCase(), status: "active" },
          { session },
        );
      if (!user || (purpose === "verify_email" && user.emailVerifiedAt)) return;
      await queueToken(user, purpose, session);
    }),
  );
  return neutral;
}

export async function identity(user: User) {
  const db = await getDatabase();
  const membership = await db
    .collection("memberships")
    .findOne({ userId: user._id });
  return {
    user: {
      id: user._id.toHexString(),
      displayName: user.displayName,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    membership: membership
      ? {
          id: membership._id.toHexString(),
          weddingId: membership.weddingId.toHexString(),
          role: membership.role,
          status: membership.status,
          version: membership.version,
        }
      : null,
  };
}

export async function login(
  email: string,
  password: string,
  oldToken?: string,
) {
  const db = await getDatabase();
  const user = await db
    .collection<User>("users")
    .findOne({ emailNormalized: email.toLowerCase() });
  const valid = await checkPassword(
    user?.passwordHash ?? (await dummyHash()),
    password,
  );
  if (!valid || !user || user.status !== "active")
    throw new AccountError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );
  const raw = randomToken();
  const now = new Date();
  await db
    .collection<Session>("sessions")
    .insertOne({
      _id: new ObjectId(),
      userId: user._id,
      tokenHash: digest(raw),
      credentialVersion: user.credentialVersion,
      expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000),
      lastSeenAt: now,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  if (oldToken) await logout(oldToken);
  return { raw, data: await identity(user) };
}

export async function currentUser(raw?: string) {
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const db = await getDatabase();
  const session = await db
    .collection<Session>("sessions")
    .findOne({
      tokenHash: digest(raw),
      expiresAt: { $gt: new Date() },
      revokedAt: { $exists: false },
    });
  if (!session) return null;
  return db
    .collection<User>("users")
    .findOne({
      _id: session.userId,
      status: "active",
      credentialVersion: session.credentialVersion,
    });
}

export async function logout(raw?: string) {
  if (raw && /^[A-Za-z0-9_-]{43}$/.test(raw)) {
    const db = await getDatabase();
    await db
      .collection<Session>("sessions")
      .updateOne(
        { tokenHash: digest(raw), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), updatedAt: new Date() } },
      );
  }
}

export async function consumeToken(
  raw: string,
  purpose: AuthToken["purpose"],
  newPassword?: string,
) {
  const db = await getDatabase();
  const passwordHash = newPassword
    ? await hashPassword(newPassword)
    : undefined;
  await db.client.withSession((session) =>
    session.withTransaction(async () => {
      const now = new Date();
      const record = await db
        .collection<AuthToken>("authTokens")
        .findOneAndUpdate(
          {
            tokenHash: digest(raw),
            purpose,
            expiresAt: { $gt: now },
            consumedAt: { $exists: false },
          },
          { $set: { consumedAt: now, updatedAt: now } },
          { session, returnDocument: "before" },
        );
      if (!record) throw invalidLink();
      const result = await db
        .collection<User>("users")
        .updateOne(
          {
            _id: record.userId,
            status: "active",
            emailNormalized: record.targetEmailNormalized,
          },
          passwordHash
            ? {
                $set: { passwordHash, updatedAt: now },
                $inc: { credentialVersion: 1 },
              }
            : { $set: { emailVerifiedAt: now, updatedAt: now } },
          { session },
        );
      if (!result.matchedCount) throw invalidLink();
      await db
        .collection<AuthToken>("authTokens")
        .updateMany(
          { userId: record.userId, purpose, consumedAt: { $exists: false } },
          { $set: { consumedAt: now, updatedAt: now } },
          { session },
        );
    }),
  );
  return purpose === "verify_email"
    ? { emailVerified: true }
    : { passwordReset: true, signInRequired: true };
}
