import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { websiteEditor, websitePreview, websiteCoverChoices, saveWebsiteDraft } from "./service";
import { coverQuerySchema } from "./schema";
import { publicationReview, publishWebsite, unpublishWebsite } from "./publication";
export async function handleWebsite(request: NextRequest, action: "read" | "save" | "preview" | "covers" | "review" | "publish" | "unpublish", weddingId: string) {
  const requestId = randomUUID(), headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", Vary: "Cookie" };
  try {
    const mutation = ["save", "publish", "unpublish"].includes(action);
    if (mutation) trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const keys = [...request.nextUrl.searchParams.keys()];
    if (new Set(keys).size !== keys.length) throw new AccountError(400, "INVALID_QUERY", "Use each query field once.");
    const query = coverQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    if (action !== "covers" && keys.length) throw new AccountError(400, "INVALID_QUERY", "Unexpected query fields.");
    if (mutation) await rateLimit(`website-${action}`, user._id.toString(), action === "save" ? 60 : 20);
    const data = action === "publish" ? await publishWebsite(user, weddingId, await body(request, 4096), request.headers.get("idempotency-key")) : action === "unpublish" ? await unpublishWebsite(user, weddingId, await body(request, 4096), request.headers.get("idempotency-key")) : action === "review" ? await publicationReview(user, weddingId) : action === "save" ? await saveWebsiteDraft(user, weddingId, await body(request, 65536), request.headers.get("idempotency-key")) : action === "preview" ? await websitePreview(user, weddingId) : action === "covers" ? await websiteCoverChoices(user, weddingId, query.cursor) : await websiteEditor(user, weddingId);
    return NextResponse.json({ data, requestId }, { headers });
  } catch (e) {
    const known = e instanceof AccountError, invalid = e instanceof z.ZodError, status = known ? e.status : invalid ? 422 : 503;
    return NextResponse.json({ error: { code: known ? e.code : invalid ? "VALIDATION_ERROR" : "WEBSITE_UNAVAILABLE", message: known ? e.message : invalid ? "Check the highlighted fields." : "The website draft is temporarily unavailable. Please retry.", ...(invalid ? { fields: e.issues.map(i => ({ path: i.path.join("."), message: i.message })) } : {}) }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  }
}
