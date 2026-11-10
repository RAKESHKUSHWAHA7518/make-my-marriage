import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { cancelInvitationEmail, invitationEmailDetails, queueInvitationEmail } from "./service";

export async function handleInvitationEmail(request: NextRequest, weddingId: string, action: "queue" | "get" | "cancel", campaignId?: string) {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
  try {
    if (action !== "get") trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    await rateLimit(`invitation-email-${action}`, user._id.toString(), action === "get" ? 300 : 30);
    const data = action === "get"
      ? await invitationEmailDetails(user, weddingId, campaignId!)
      : action === "queue"
        ? await queueInvitationEmail(user, weddingId, await body(request, 8192), request.headers.get("idempotency-key"))
        : await cancelInvitationEmail(user, weddingId, campaignId!, await body(request, 8192));
    return NextResponse.json({ data, requestId }, { headers, status: action === "get" ? 200 : 202 });
  } catch (error) {
    const known = error instanceof AccountError;
    const invalid = error instanceof ZodError;
    const status = known ? error.status : invalid ? 422 : 503;
    return NextResponse.json({
      error: {
        code: known ? error.code : invalid ? "VALIDATION_ERROR" : "EMAIL_UNAVAILABLE",
        message: known ? error.message : invalid ? "Review the invitation details and try again." : "Invitation email is temporarily unavailable.",
      },
      requestId,
    }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  }
}
