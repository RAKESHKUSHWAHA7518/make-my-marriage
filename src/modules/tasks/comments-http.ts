import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { listTaskComments, saveTaskComment } from "./comments";

export async function handleTaskComments(request: NextRequest, action: "list" | "create" | "patch" | "remove", weddingId: string, taskId: string, id?: string) {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
  try {
    if (action !== "list") trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const query = request.nextUrl.searchParams, keys = [...query.keys()];
    if (new Set(keys).size !== keys.length || (action !== "list" && keys.length)) {
      throw new AccountError(400, "INVALID_QUERY", "Unexpected query fields.");
    }
    if (action === "list") {
      return NextResponse.json({ ...await listTaskComments(user, weddingId, taskId, Object.fromEntries(query)), requestId }, { headers });
    }
    await rateLimit("task-comments-write", user._id.toString(), 60);
    const data = await saveTaskComment(user, weddingId, taskId, action, id, await body(request, 65536), request.headers.get("idempotency-key"));
    return NextResponse.json({ data, requestId }, { status: action === "create" ? 201 : 200, headers });
  } catch (error) {
    const known = error instanceof AccountError, invalid = error instanceof ZodError;
    const status = known ? error.status : invalid ? 422 : 503;
    return NextResponse.json({
      error: {
        code: known ? error.code : invalid ? "VALIDATION_ERROR" : "COMMENTS_UNAVAILABLE",
        message: known ? error.message : invalid ? "Check the comment and try again." : "Comments are temporarily unavailable. Please retry.",
        ...(invalid ? { fields: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) } : {}),
      },
      requestId,
    }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  }
}
