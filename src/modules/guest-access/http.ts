import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccountError, origin, digest } from "@/modules/identity/security";
import { body, trustedMutation } from "@/modules/identity/http";
import { rateLimit } from "@/modules/identity/service";
import { exchangeSchema } from "./schema";
import { handleGalleryAccess } from "@/modules/media/gallery-http";
import { exchangeHousehold, guestSessionSeconds, guestSite, invitationUnavailable, logoutHousehold, saveGuestRsvp } from "./service";
export const householdCookieName = () => origin().startsWith("https:") ? "__Host-mmm_household" : "mmm_household";
const options = () => ({ httpOnly: true, secure: origin().startsWith("https:"), sameSite: "lax" as const, path: "/", maxAge: guestSessionSeconds });
export const guestPrivateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
export async function handleGuest(request: NextRequest, action: "exchange" | "logout" | "site" | "events" | "rsvp" | "save-rsvp") {
  if (action === "exchange" || action === "logout") {
    try {
      const input = await body(request.clone() as NextRequest);
      if (input && typeof input === "object" && "kind" in input && input.kind === "gallery") return handleGalleryAccess(request, action);
    } catch { /* Existing handler returns the normal bounded validation error. */ }
  }
  const requestId = randomUUID(), headers = { ...guestPrivateHeaders, "X-Request-Id": requestId };
  try {
    const raw = request.cookies.get(householdCookieName())?.value;
    if (["exchange", "logout", "save-rsvp"].includes(action)) {
      trustedMutation(request);
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 128) ?? "unknown";
      await rateLimit("household-mutation-ip", ip, 300);
    }
    if (action === "exchange") {
      const parsed = exchangeSchema.safeParse(await body(request));
      if (!parsed.success) throw invitationUnavailable();
      await rateLimit("household-exchange-total", "global", 5000);
      await rateLimit("household-exchange-token", digest(parsed.data.token), 30);
      const token = await exchangeHousehold(parsed.data.token);
      const response = NextResponse.json({ data: { kind: "household", redirectPath: "/guest" }, requestId }, { headers });
      response.cookies.set(householdCookieName(), token, options()); return response;
    }
    if (action === "logout") {
      z.strictObject({ kind: z.literal("household") }).parse(await body(request));
      await logoutHousehold(raw);
      const response = new NextResponse(null, { status: 204, headers });
      response.cookies.set(householdCookieName(), "", { ...options(), maxAge: 0 }); return response;
    }
    if (action === "save-rsvp") {
      // Validate the session before interpreting a response or counting per-household attempts.
      await guestSite(raw);
      await rateLimit("household-rsvp", digest(raw!), 60);
      return NextResponse.json({ data: await saveGuestRsvp(raw, await body(request), request.headers.get("idempotency-key")), requestId }, { headers });
    }
    const site = await guestSite(raw);
    return NextResponse.json({ data: action === "events" ? site.events : action === "rsvp" ? site.rsvp : site, requestId }, { headers });
  } catch (error) {
    const validation = error instanceof z.ZodError, known = error instanceof AccountError, status = validation ? 422 : known ? error.status : 503;
    const response = NextResponse.json({ error: { code: validation ? "VALIDATION_ERROR" : known ? error.code : "SERVICE_UNAVAILABLE", message: validation ? "Please check your response and count." : known ? error.message : "Invitations are temporarily unavailable. Please retry.", ...(validation ? { fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } : {}) }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
    if (action === "exchange" && status === 404) response.cookies.set(householdCookieName(), "", { ...options(), maxAge: 0 });
    return response;
  }
}
