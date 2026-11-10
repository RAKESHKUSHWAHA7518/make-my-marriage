import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { listPrivateAttachments, removePrivateAttachment } from "./attachments";
import type { AttachmentPurpose } from "./attachment-policy";

export async function handlePrivateAttachments(request: NextRequest, purpose: AttachmentPurpose, weddingId: string, resourceId: string, assetId?: string) {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  try {
    if (assetId) trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    if (request.nextUrl.search) throw new AccountError(400, "INVALID_QUERY", "Unexpected query fields.");
    if (assetId) await rateLimit(`${purpose}-remove`, user._id.toString(), 60);
    const data = assetId
      ? await removePrivateAttachment(user, purpose, weddingId, resourceId, assetId, await body(request))
      : await listPrivateAttachments(user, purpose, weddingId, resourceId);
    return NextResponse.json({ data, requestId }, { headers });
  } catch (error) {
    const known = error instanceof AccountError, invalid = error instanceof ZodError;
    const status = known ? error.status : invalid ? 422 : 503;
    return NextResponse.json({
      error: { code: known ? error.code : invalid ? "VALIDATION_ERROR" : "ATTACHMENTS_UNAVAILABLE", message: known ? error.message : invalid ? "Check the attachment and try again." : "Couldn’t load or update attachments. Please retry." }, requestId,
    }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  }
}
