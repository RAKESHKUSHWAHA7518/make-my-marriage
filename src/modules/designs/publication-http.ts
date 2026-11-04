import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { AccountError, digest } from "@/modules/identity/security";
import { householdCookieName } from "@/modules/guest-access/http";
import { galleryDeliveryUrl } from "@/infrastructure/cloudinary/provider";
import { householdCardChoices, listVersions, publicationReview, publishDesign, selectHouseholdCard } from "./publication";
import { guestCard, guestCardAsset } from "./guest";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown, requestId: string) {
  const known = error instanceof AccountError, invalid = error instanceof z.ZodError, status = known ? error.status : invalid ? 422 : 503;
  return NextResponse.json({ error: { code: known ? error.code : invalid ? "VALIDATION_ERROR" : "INVITATION_UNAVAILABLE", message: known ? error.message : invalid ? "Review the selected invitation and try again." : "Invitation artwork is temporarily unavailable. Please retry." }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
}
export async function handlePublication(request: NextRequest, action: "review" | "publish" | "versions" | "choices" | "select", weddingId: string, id: string) {
  const requestId = randomUUID();
  try {
    const mutate = ["publish", "select"].includes(action); if (mutate) trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value); if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const keys = [...request.nextUrl.searchParams.keys()];
    if (keys.length > 1 || keys.some(k => !["versions", "choices"].includes(action) || k !== "cursor") || (request.nextUrl.searchParams.get("cursor")?.length ?? 0) > 1500) throw new AccountError(400, "INVALID_QUERY", "Unexpected query fields.");
    await rateLimit(`design-${action}`, user._id.toString(), mutate ? 60 : 300);
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const data = action === "review" ? await publicationReview(user, weddingId, id) : action === "versions" ? await listVersions(user, weddingId, id, cursor) : action === "choices" ? await householdCardChoices(user, weddingId, id, cursor) : action === "publish" ? await publishDesign(user, weddingId, id, await body(request, 4096), request.headers.get("idempotency-key")) : await selectHouseholdCard(user, weddingId, id, await body(request, 4096), request.headers.get("idempotency-key"));
    return NextResponse.json({ data, requestId }, { status: action === "publish" ? 201 : 200, headers });
  } catch (error) { return failure(error, requestId); }
}
export async function handleGuestCard(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const raw = request.cookies.get(householdCookieName())?.value;
    if (!raw) throw new AccountError(404, "CARD_UNAVAILABLE", "Invitation artwork unavailable.");
    const query = z.strictObject({ version: z.string().regex(/^[a-f0-9]{24}$/), image: z.literal("1").optional() }).parse(Object.fromEntries(request.nextUrl.searchParams));
    if ([...request.nextUrl.searchParams.keys()].length !== new Set(request.nextUrl.searchParams.keys()).size) throw new AccountError(400, "INVALID_QUERY", "Unexpected query fields.");
    await rateLimit("guest-card", digest(raw), 600);
    const card = await guestCard(raw, query.version);
    if (!card) throw new AccountError(404, "CARD_UNAVAILABLE", "Invitation artwork unavailable.");
    if (!query.image) return NextResponse.json({ data: card, requestId }, { headers });
    const asset = await guestCardAsset(raw, query.version);
    const upstream = await fetch(galleryDeliveryUrl(asset.publicId, asset.providerVersion, "gallery"), { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!upstream.ok || !upstream.body || !upstream.headers.get("content-type")?.startsWith("image/jpeg") || Number(upstream.headers.get("content-length") ?? 0) > 4_000_000) { await upstream.body?.cancel(); throw Error("Artwork unavailable"); }
    const chunks: Uint8Array[] = []; let bytes = 0;
    const reader = upstream.body.getReader();
    try { for (;;) { const r = await reader.read(); if (r.done) break; bytes += r.value.byteLength; if (bytes > 4_000_000) throw Error("Artwork exceeds delivery limit"); chunks.push(r.value); } } finally { await reader.cancel(); }
    // Recheck after upstream transfer: rotated links, household removal/reassignment and event cancellation revoke reads.
    const latest = await guestCardAsset(raw, query.version);
    if (!latest._id.equals(asset._id) || latest.version !== asset.version) throw new AccountError(404, "CARD_UNAVAILABLE", "Invitation artwork unavailable.");
    return new NextResponse(Buffer.concat(chunks), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": "inline" } });
  } catch (error) { return failure(error, requestId); }
}
