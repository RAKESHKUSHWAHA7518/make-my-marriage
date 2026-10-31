import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { AccountError, digest } from "@/modules/identity/security";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { galleryDeliveryUrl } from "@/infrastructure/cloudinary/provider";
import { assetFor, completeUpload, createUpload, listGallery, removeAsset, uploadFor } from "./service";
import { guestGallery, guestGalleryAsset, guestUploadActor } from "./gallery-access";
import { galleryCookieName } from "./gallery-http";
import { householdCookieName } from "@/modules/guest-access/http";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
export async function handleMedia(request: NextRequest, action: "list"|"create"|"intent"|"complete"|"content"|"remove", resourceId?: string, weddingId?: string) {
  const requestId = randomUUID();
  try {
    if (["create","complete","remove"].includes(action)) trustedMutation(request);
    const audience = request.nextUrl.searchParams.get("audience");
    const guest = ["guest", "household"].includes(audience ?? "");
    if (guest && action === "remove") throw new AccountError(403, "FORBIDDEN", "Only the planning family can remove saved photos.");
    const galleryToken = audience === "household" ? undefined : request.cookies.get(galleryCookieName())?.value, householdToken = request.cookies.get(householdCookieName())?.value;
    const user = guest ? null : await currentUser(request.cookies.get(cookieName())?.value);
    if (!user && !guest) throw new AccountError(401,"UNAUTHENTICATED","Please sign in again.");
    const uploadGuest = guest && ["create", "intent", "complete"].includes(action) ? await guestUploadActor(audience === "household" ? "household" : galleryToken ? "gallery" : "household", galleryToken ?? householdToken) : null;
    if (["create","complete","remove"].includes(action)) {
      await rateLimit(`media-${action}`, (uploadGuest ?? user)!._id.toString(), action === "create" ? 60 : 180);
      if (uploadGuest) await rateLimit(`guest-media-wedding-${action}`, uploadGuest.weddingId.toString(), action === "create" ? 600 : 1800);
    }
    if (action === "content") {
      const variant = z.enum(["thumbnail","gallery"]).parse(request.nextUrl.searchParams.get("variant") ?? "thumbnail");
      const asset = guest ? await guestGalleryAsset(resourceId!, galleryToken, householdToken) : await assetFor(user!, resourceId!);
      if (guest) await rateLimit("gallery-content", digest(galleryToken ?? householdToken!), 1200);
      const upstream = await fetch(galleryDeliveryUrl(asset.publicId, asset.providerVersion, variant), { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
      const max = 4_000_000;
      if (!upstream.ok || !upstream.body || !upstream.headers.get("content-type")?.startsWith("image/jpeg") || Number(upstream.headers.get("content-length") ?? 0) > max) { await upstream.body?.cancel(); throw Error("Media delivery unavailable"); }
      let bytes = 0;
      const bounded = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > max) throw Error("Photo delivery limit exceeded"); controller.enqueue(chunk); } }));
      return new NextResponse(bounded, { headers: { ...headers, "Content-Type":"image/jpeg", "Content-Disposition":"inline" } });
    }
    let data;
    if (action === "list") data = guest ? await guestGallery(galleryToken, householdToken, request.nextUrl.searchParams.get("cursor") ?? undefined) : await listGallery(user!,request.nextUrl.searchParams.get("cursor") ?? undefined);
    else if (action === "create") data = await createUpload(uploadGuest ?? user!,await body(request),request.headers.get("idempotency-key"));
    else if (action === "intent") { if (uploadGuest) await rateLimit("guest-media-status", uploadGuest._id.toString(), 300); data = await uploadFor(uploadGuest ?? user!,resourceId!); }
    else if (action === "complete") { z.strictObject({}).parse(await body(request)); data = await completeUpload(uploadGuest ?? user!,resourceId!); }
    else data = await removeAsset(user!,weddingId!,resourceId!,await body(request));
    if (guest && action === "list") await rateLimit("gallery-list", digest(galleryToken ?? householdToken!), 300);
    const status = action === "create" ? 201 : action === "remove" || (action === "complete" && !(data && "ready" in data && data.ready)) ? 202 : 200;
    return NextResponse.json({ data,requestId },{status,headers});
  } catch(error) {
    const known = error instanceof AccountError, validation = error instanceof z.ZodError;
    const status = known ? error.status : validation ? 422 : 503;
    const guestStorageError = known && error.code === "STORAGE_FULL" && ["guest", "household"].includes(request.nextUrl.searchParams.get("audience") ?? "");
    return NextResponse.json({ error: { code: known ? error.code : validation ? "VALIDATION_ERROR" : "MEDIA_SERVICE_UNAVAILABLE", message: guestStorageError ? "This gallery cannot accept more photos right now. Please contact the family." : known ? error.message : validation ? "Check the selected photo and try again." : "The gallery is temporarily unavailable. Please retry." },requestId },{status,headers:{...headers,...(status === 429 ? {"Retry-After":"900"} : {})}});
  }
}
