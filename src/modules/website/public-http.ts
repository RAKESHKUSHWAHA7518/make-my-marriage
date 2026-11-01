import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { AccountError } from "@/modules/identity/security";
import { rateLimit } from "@/modules/identity/service";
import { galleryDeliveryUrl } from "@/infrastructure/cloudinary/provider";
import { publicWebsite, publicCoverAsset } from "./publication";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff" };
export async function handlePublicWebsite(request: NextRequest, slug: string, assetId?: string) {
  const requestId = randomUUID();
  try {
    if (request.nextUrl.search) throw new AccountError(400, "INVALID_QUERY", "Unexpected query fields.");
    if (!assetId) return NextResponse.json({ data: await publicWebsite(slug), requestId }, { headers });
    const asset = await publicCoverAsset(slug, assetId);
    await rateLimit("public-cover", slug, 1800);
    const upstream = await fetch(galleryDeliveryUrl(asset.publicId, asset.providerVersion, "gallery"), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!upstream.ok || !upstream.body || !upstream.headers.get("content-type")?.startsWith("image/jpeg") || Number(upstream.headers.get("content-length") ?? 0) > 4_000_000) { await upstream.body?.cancel(); throw Error("Cover unavailable"); }
    // Recheck after the upstream request: unpublishing during preparation must not start new delivery.
    try { await publicCoverAsset(slug, assetId); } catch (e) { await upstream.body.cancel(); throw e; }
    let bytes = 0;
    const bounded = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > 4_000_000) throw Error("Cover delivery limit exceeded"); controller.enqueue(chunk); } }));
    return new NextResponse(bounded, { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": "inline" } });
  } catch (error) {
    const known = error instanceof AccountError, status = known ? error.status : 503;
    return NextResponse.json({ error: { code: known ? error.code : "WEBSITE_UNAVAILABLE", message: known ? error.message : "This wedding website is temporarily unavailable." }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  }
}
