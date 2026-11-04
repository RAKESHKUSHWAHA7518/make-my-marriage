import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { AccountError } from "@/modules/identity/security";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { designFor, listDesigns, saveDesign } from "./service";
export async function handleDesigns(request: NextRequest, action: "list" | "create" | "get" | "patch", weddingId: string, id?: string) {
  const requestId = randomUUID(), headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
  try {
    const mutate = ["create", "patch"].includes(action); if (mutate) trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value); if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const keys = [...request.nextUrl.searchParams.keys()]; if (new Set(keys).size !== keys.length || (action !== "list" && keys.length)) throw new AccountError(400, "INVALID_QUERY", "Unexpected query fields.");
    await rateLimit(`designs-${action}`, user._id.toString(), mutate ? 60 : 300);
    const data = action === "list" ? await listDesigns(user, weddingId, Object.fromEntries(request.nextUrl.searchParams)) : action === "get" ? await designFor(user, weddingId, id!) : await saveDesign(user, weddingId, action === "create" ? null : id!, await body(request, 65536), request.headers.get("idempotency-key"));
    if (!data) throw new AccountError(404, "NOT_FOUND", "Invitation draft unavailable.");
    return NextResponse.json({ data, requestId }, { status: action === "create" ? 201 : 200, headers });
  } catch (e) { const known = e instanceof AccountError, invalid = e instanceof z.ZodError, status = known ? e.status : invalid ? 422 : 503;
    return NextResponse.json({ error: { code: known ? e.code : invalid ? "VALIDATION_ERROR" : "DESIGNS_UNAVAILABLE", message: known ? e.message : invalid ? "Check the highlighted fields." : "Invitation drafts are temporarily unavailable. Please retry.", ...(invalid ? { fields: e.issues.map(i => ({ path: i.path.join("."), message: i.message })) } : {}) }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } }); }
}
