import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { AccountError, digest, origin } from "@/modules/identity/security";
import { exchangeGallery, gallerySettings, galleryUnavailable, logoutGallery, manageGallery } from "./gallery-access";

export const galleryCookieName = () => origin().startsWith("https:") ? "__Host-mmm_gallery" : "mmm_gallery";
const cookieOptions = () => ({ httpOnly: true, secure: origin().startsWith("https:"), sameSite: "lax" as const, path: "/", maxAge: 7 * 86400 });
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
export async function handleGalleryAccess(request: NextRequest, action: "read" | "settings" | "share" | "rotate" | "exchange" | "logout", weddingId = "") {
  const requestId = randomUUID(), headers = { ...privateHeaders, "X-Request-Id": requestId };
  try {
    if (action !== "read") trustedMutation(request);
    let data;
    if (action === "exchange" || action === "logout") {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0,128) ?? "unknown";
      await rateLimit("gallery-access-ip", ip, 300);
      if (action === "logout") {
        z.strictObject({ kind: z.literal("gallery") }).parse(await body(request));
        await logoutGallery(request.cookies.get(galleryCookieName())?.value);
        const response = new NextResponse(null, { status: 204, headers }); response.cookies.set(galleryCookieName(), "", { ...cookieOptions(), maxAge: 0 }); return response;
      }
      const input = z.strictObject({ kind: z.literal("gallery"), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).safeParse(await body(request));
      if (!input.success) throw galleryUnavailable();
      await rateLimit("gallery-exchange-total", "global", 5000); await rateLimit("gallery-exchange-token", digest(input.data.token), 30);
      const token = await exchangeGallery(input.data.token);
      const response = NextResponse.json({ data: { kind: "gallery", redirectPath: "/shared-gallery" }, requestId }, { headers }); response.cookies.set(galleryCookieName(), token, cookieOptions()); return response;
    }
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    if (action !== "read") await rateLimit(`gallery-${action}`, user._id.toString(), 60);
    if (action === "read") data = await gallerySettings(user, weddingId);
    else data = await manageGallery(user, weddingId, action, action === "share" ? undefined : await body(request), request.headers.get("idempotency-key"));
    return NextResponse.json({ data, requestId }, { headers });
  } catch (error) {
    const known = error instanceof AccountError, validation = error instanceof z.ZodError, status = known ? error.status : validation ? 422 : 503;
    const response = NextResponse.json({ error: { code: known ? error.code : validation ? "VALIDATION_ERROR" : "GALLERY_SERVICE_UNAVAILABLE", message: known ? error.message : validation ? "Check your changes and try again." : "Gallery sharing is temporarily unavailable. Please retry." }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
    if (action === "exchange" && status === 404) response.cookies.set(galleryCookieName(), "", { ...cookieOptions(), maxAge: 0 });
    return response;
  }
}
