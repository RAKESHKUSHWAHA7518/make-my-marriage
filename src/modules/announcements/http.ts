import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { AccountError } from "@/modules/identity/security";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { listAnnouncements, saveAnnouncement } from "./service";
export async function handleAnnouncements(request: NextRequest, action: "list" | "create" | "patch" | "remove", weddingId: string, id?: string) {
  const requestId = randomUUID(), headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
  try {
    if (action !== "list") trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const keys = [...request.nextUrl.searchParams.keys()];
    if (new Set(keys).size !== keys.length || (action !== "list" && keys.length)) throw new AccountError(400, "INVALID_QUERY", "Unexpected query fields.");
    if (action !== "list") await rateLimit(`announcements-${action}`, user._id.toString(), 60);
    const data = action === "list" ? await listAnnouncements(user, weddingId, Object.fromEntries(request.nextUrl.searchParams)) : await saveAnnouncement(user, weddingId, action === "create" ? null : id!, await body(request, 65536), request.headers.get("idempotency-key"), action === "remove");
    return NextResponse.json({ data, requestId }, { status: action === "create" ? 201 : 200, headers });
  } catch (e) {
    const known = e instanceof AccountError, invalid = e instanceof z.ZodError, status = known ? e.status : invalid ? 422 : 503;
    return NextResponse.json({ error: { code: known ? e.code : invalid ? "VALIDATION_ERROR" : "ANNOUNCEMENTS_UNAVAILABLE", message: known ? e.message : invalid ? "Check the highlighted fields." : "Family announcements are temporarily unavailable. Please retry.", ...(invalid ? { fields: e.issues.map(i => ({ path: i.path.join("."), message: i.message })) } : {}) }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  }
}
