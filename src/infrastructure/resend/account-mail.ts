import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/infrastructure/mongodb/client";
import {
  decrypt,
  digest,
  mailConfiguration,
  type Encrypted,
} from "@/modules/identity/security";

/** Bounded account and family-invitation mail worker. Provider calls occur outside transactions. */
import { reconcileReceipts } from "./receipts";

export async function sendAccountEmails() {
  const config = mailConfiguration();
  const db = await getDatabase();
  const owner = randomUUID();
  let processed = 0;
  // Expired secrets are removed independently of job state, including crashes.
  const expired = await db
    .collection("deliveries")
    .find(
      {
        kind: { $in: ["verify_email", "reset_password", "membership_invite"] },
        payloadExpiresAt: { $lte: new Date() },
        payloadEncrypted: { $exists: true },
      },
      { projection: { _id: 1 } },
    )
    .limit(20)
    .toArray();
  await db
    .collection("deliveries")
    .updateMany(
      { _id: { $in: expired.map((row) => row._id) } },
      { $unset: { payloadEncrypted: "", recipientEmailEncrypted: "" } },
    );
  for (let i = 0; i < 2; i++) {
    const now = new Date();
    const job = await db.collection("jobs").findOneAndUpdate(
      {
        kind: "email_send",
        runAt: { $lte: now },
        $or: [
          { state: { $in: ["queued", "retry"] } },
          { state: "running", leaseUntil: { $lt: now } },
        ],
      },
      {
        $set: {
          state: "running",
          leaseOwner: owner,
          leaseUntil: new Date(now.getTime() + 60000),
          updatedAt: now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { runAt: 1 }, returnDocument: "after" },
    );
    if (!job) break;
    const delivery = await db.collection("deliveries").findOne({
      _id: job.payloadRef.deliveryId,
      kind: { $in: ["verify_email", "reset_password", "membership_invite"] },
    });
    // A prior request may have reached Resend even when its response was lost.
    let acceptanceUncertain = delivery?.submissionState === "submitting";
    let state = acceptanceUncertain ? "dead" : "done",
      submissionState = acceptanceUncertain ? "unknown" : "suppressed",
      errorCode: string | undefined,
      providerMessageId: string | undefined;
    try {
      if (delivery?.submissionState === "accepted") {
        submissionState = "accepted";
        state = "done";
      } else if (
        job.attempts > job.maxAttempts ||
        (delivery?.submissionState === "submitting" &&
          !delivery.payloadEncrypted)
      ) {
        submissionState = "unknown";
        state = "dead";
      } else if (
        delivery &&
        ["unknown", "failed", "suppressed"].includes(delivery.submissionState)
      ) {
        submissionState = delivery.submissionState;
        state = "dead";
      } else if (
        delivery?.payloadEncrypted &&
        delivery.payloadExpiresAt > now
      ) {
        const active = await db
          .collection("users")
          .findOne({ _id: delivery.userId, status: "active" });
        const token =
          delivery.kind === "membership_invite"
            ? await db
                .collection("membershipInvites")
                .findOne({
                  _id: delivery.membershipInviteId,
                  weddingId: delivery.weddingId,
                  state: "pending",
                  expiresAt: { $gt: now },
                })
            : await db.collection("authTokens").findOne({
                _id: delivery.authTokenId,
                consumedAt: { $exists: false },
                expiresAt: { $gt: now },
              });
        const wedding =
          delivery.kind === "membership_invite"
            ? await db
                .collection("weddings")
                .findOne({ _id: delivery.weddingId, state: "active" })
            : true;
        const issuer =
          delivery.kind === "membership_invite"
            ? await db
                .collection("memberships")
                .findOne({
                  userId: delivery.userId,
                  weddingId: delivery.weddingId,
                  role: "ADMIN",
                  status: "active",
                })
            : true;
        const suppressed = await db.collection("deliveries").findOne({
          recipientKey: delivery.recipientKey,
          $or: [
            { bouncedAt: { $exists: true } },
            { complainedAt: { $exists: true } },
          ],
        });
        if (
          active &&
          token &&
          wedding &&
          issuer &&
          (delivery.kind !== "membership_invite" || active.emailVerifiedAt) &&
          !suppressed &&
          !(delivery.kind === "verify_email" && active.emailVerifiedAt)
        ) {
          const payload = decrypt(delivery.payloadEncrypted as Encrypted);
          if (digest(payload) !== delivery.payloadHash)
            throw new Error("INVALID_PAYLOAD");
          // Our retry window is strictly inside Resend's 24-hour idempotency window.
          if (now.getTime() - delivery.createdAt.getTime() > 23 * 3600000) {
            submissionState = "unknown";
            state = "dead";
          } else {
            await db
              .collection("deliveries")
              .updateOne(
                { _id: delivery._id },
                { $set: { submissionState: "submitting", updatedAt: now } },
              );
            acceptanceUncertain = true;
            const result = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
                "Idempotency-Key": delivery.dedupeKey,
              },
              body: payload,
              signal: AbortSignal.timeout(10000),
            });
            if (result.ok) {
              const body = await result.json();
              if (typeof body.id !== "string")
                throw new Error("PROVIDER_UNCERTAIN");
              providerMessageId = body.id;
              submissionState = "accepted";
              state = "done";
            } else if (
              result.status === 429 ||
              result.status >= 500 ||
              result.status === 409
            ) {
              throw new Error("PROVIDER_RETRY");
            } else {
              submissionState = "failed";
              state = "dead";
              errorCode = "PROVIDER_REJECTED";
            }
          }
        }
      }
    } catch {
      state = job.attempts >= job.maxAttempts ? "dead" : "retry";
      submissionState =
        state === "dead"
          ? "unknown"
          : acceptanceUncertain
            ? "submitting"
            : "queued";
      errorCode = "EMAIL_RETRY_REQUIRED";
    }
    await db.client.withSession((session) =>
      session.withTransaction(async () => {
        const owned = await db.collection("jobs").updateOne(
          { _id: job._id, leaseOwner: owner, state: "running" },
          {
            $set: {
              state,
              updatedAt: new Date(),
              ...(state === "retry"
                ? {
                    runAt: new Date(
                      Date.now() +
                        Math.min(3600000, 60000 * 2 ** job.attempts) +
                        Math.random() * 5000,
                    ),
                  }
                : { completedAt: new Date() }),
              ...(errorCode ? { lastErrorCode: errorCode } : {}),
            },
            $unset: { leaseOwner: "", leaseUntil: "" },
          },
          { session },
        );
        if (!owned.matchedCount) return;
        if (delivery)
          await db.collection("deliveries").updateOne(
            { _id: delivery._id },
            {
              $set: {
                submissionState,
                updatedAt: new Date(),
                ...(providerMessageId
                  ? { providerMessageId, acceptedAt: new Date() }
                  : {}),
                ...(errorCode ? { lastErrorCode: errorCode } : {}),
              },
              $inc: { version: 1 },
              ...(state !== "retry"
                ? {
                    $unset: {
                      payloadEncrypted: "",
                      recipientEmailEncrypted: "",
                    },
                  }
                : {}),
            },
            { session },
          );
      }),
    );
    processed++;
  }
  await reconcileReceipts();
  return { processed };
}
