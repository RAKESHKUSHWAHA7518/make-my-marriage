import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { digest, encrypt } from "@/modules/identity/security";
import { reconcileReceipts } from "@/infrastructure/resend/receipts";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new NextResponse(null, { status: 503 });
  const reader = request.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 65536) {
      await reader.cancel();
      return new NextResponse(null, { status: 413 });
    }
    chunks.push(part.value);
  }
  const payload = Buffer.concat(chunks).toString("utf8");
  let event: { type: string; created_at: string; data: { email_id: string } };
  try {
    new Webhook(secret).verify(payload, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    });
    event = JSON.parse(payload);
    if (!event.data?.email_id || !Number.isFinite(Date.parse(event.created_at)))
      throw new Error();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (
    !["email.delivered", "email.bounced", "email.complained"].includes(
      event.type,
    )
  )
    return new NextResponse(null, { status: 204 });
  try {
    const db = await getDatabase();
    const now = new Date();
    await db
      .collection("webhookReceipts")
      .updateOne(
        { provider: "resend", providerEventId: request.headers.get("svix-id") },
        {
          $setOnInsert: {
            eventType: event.type,
            payloadHash: digest(payload),
            payloadEncrypted: encrypt(
              JSON.stringify({
                emailId: event.data.email_id,
                occurredAt: event.created_at,
              }),
            ),
            receivedAt: now,
            state: "received",
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    await reconcileReceipts();
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
