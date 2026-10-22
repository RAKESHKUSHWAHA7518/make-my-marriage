import "server-only";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { decrypt, type Encrypted } from "@/modules/identity/security";

export async function reconcileReceipts() {
  const db = await getDatabase();
  const rows = await db
    .collection("webhookReceipts")
    .find({
      provider: "resend",
      state: "received",
      $or: [
        { nextAttemptAt: { $exists: false } },
        { nextAttemptAt: { $lte: new Date() } },
      ],
    })
    .sort({ nextAttemptAt: 1, receivedAt: 1 })
    .limit(20)
    .toArray();
  for (const row of rows) {
    const event = JSON.parse(decrypt(row.payloadEncrypted as Encrypted)) as {
      emailId: string;
      occurredAt: string;
    };
    const field = (
      {
        "email.delivered": "deliveredAt",
        "email.bounced": "bouncedAt",
        "email.complained": "complainedAt",
      } as Record<string, string>
    )[row.eventType];
    await db.client.withSession((session) =>
      session.withTransaction(async () => {
        const current = await db.collection("webhookReceipts").findOne({ _id: row._id, state: "received" }, { session });
        if (!current) return;
        const delivery = await db
          .collection("deliveries")
          .findOne({ providerMessageId: event.emailId }, { session });
        if (!delivery) {
          const now = new Date();
          // Retain early callbacks while provider acceptance is being persisted.
          // Unknown messages must not monopolize every subsequent batch.
          const expired = now.getTime() - row.receivedAt.getTime() >= 48 * 3600000;
          await db.collection("webhookReceipts").updateOne(
            { _id: row._id, state: "received" },
            {
              $set: {
                updatedAt: now,
                ...(expired
                  ? { state: "failed", lastErrorCode: "UNMATCHED_DELIVERY", purgeAt: new Date(now.getTime() + 90 * 86400000) }
                  : { nextAttemptAt: new Date(now.getTime() + 60000) }),
              },
              ...(expired ? { $unset: { payloadEncrypted: "", nextAttemptAt: "" } } : {}),
            },
            { session },
          );
          return;
        }
        if (field)
          await db
            .collection("deliveries")
            .updateOne(
              { _id: delivery._id },
              {
                $set: {
                  [field]: new Date(event.occurredAt),
                  updatedAt: new Date(),
                },
                $inc: { version: 1 },
              },
              { session },
            );
        await db
          .collection("webhookReceipts")
          .updateOne(
            { _id: row._id, state: "received" },
            {
              $set: {
                state: "processed",
                processedAt: new Date(),
                updatedAt: new Date(),
                purgeAt: new Date(Date.now() + 90 * 86400000),
              },
              $unset: { payloadEncrypted: "", nextAttemptAt: "" },
            },
            { session },
          );
      }),
    );
  }
}
