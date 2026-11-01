import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { listVendors, vendorFor, saveVendor } from "./service";

export async function handleVendors(request: NextRequest, action: "list" | "detail" | "create" | "update" | "remove", weddingId: string, id?: string) {
  const requestId = randomUUID(), headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Request-Id": requestId };
  try {
    const mutation = ["create", "update", "remove"].includes(action);
    if (mutation) trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in to continue.");
    if (mutation) await rateLimit(`vendor-${action}`, user._id.toString(), action === "create" ? 20 : 60);
    if (action === "list") return NextResponse.json({ ...await listVendors(user, weddingId, Object.fromEntries(request.nextUrl.searchParams)), requestId }, { headers });
    const data = action === "detail" ? await vendorFor(user, weddingId, id!) : await saveVendor(user, weddingId, action === "create" ? null : id!, await body(request, 65536), request.headers.get("idempotency-key"), action === "remove");
    if (!data) throw new AccountError(404, "NOT_FOUND", "Vendor unavailable.");
    return NextResponse.json({ data, requestId }, { status: action === "create" ? 201 : 200, headers });
  } catch (error) {
    const validation = error instanceof z.ZodError, known = error instanceof AccountError, status = validation ? 422 : known ? error.status : 503;
    return NextResponse.json({ error: {
      code: validation ? "VALIDATION_ERROR" : known ? error.code : "VENDORS_UNAVAILABLE",
      message: validation ? "Please check the highlighted fields." : known ? error.message : "Vendor contacts are temporarily unavailable. Please retry.",
      ...(validation ? { fields: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) } : {}),
      ...(known && "currentVersion" in error ? { currentVersion: error.currentVersion } : {}),
      ...(known && error.code === "VENDOR_ALREADY_SAVED" && "existingVendorId" in error ? { existingVendorId: error.existingVendorId, ...( "existingVendorStatus" in error ? { existingVendorStatus: error.existingVendorStatus } : {}) } : {}),
    }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  }
}
