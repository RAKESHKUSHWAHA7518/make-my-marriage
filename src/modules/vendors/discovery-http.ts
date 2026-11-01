import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookieName } from "@/modules/identity/http";
import { AccountError, origin } from "@/modules/identity/security";
import { currentUser } from "@/modules/identity/service";
import { discoverVendors } from "./discovery";

export async function handleDiscovery(request: NextRequest, weddingId: string, details = false) {
  const requestId = randomUUID(), headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Request-Id": requestId, "Vary": "Cookie" };
  try {
    // These GETs incur provider charges. Require a same-origin explicit client request.
    if (request.headers.get("x-mmm-csrf") !== "1" || request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.has("origin") && request.headers.get("origin") !== origin())) throw new AccountError(403, "UNTRUSTED_REQUEST", "Please reload this page and try again.");
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in to continue.");
    const query: Record<string, string> = {};
    for (const [key, value] of request.nextUrl.searchParams) { if (key in query) throw new AccountError(422, "VALIDATION_ERROR", "Use each search field once."); query[key] = value; }
    return NextResponse.json({ ...await discoverVendors(user, weddingId, query, details), requestId }, { headers });
  } catch (error) {
    const known = error instanceof AccountError, validation = error instanceof z.ZodError, status = known ? error.status : validation ? 422 : 503;
    return NextResponse.json({ error: { code: known ? error.code : validation ? "VALIDATION_ERROR" : "DISCOVERY_UNAVAILABLE", message: known ? error.message : validation ? "Choose a category and enter a valid city or area." : "Business discovery is temporarily unavailable. You can still add a vendor manually." }, requestId },
      { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": known && error.code === "PROVIDER_RATE_LIMITED" ? "60" : "900" } : {}) } });
  }
}
