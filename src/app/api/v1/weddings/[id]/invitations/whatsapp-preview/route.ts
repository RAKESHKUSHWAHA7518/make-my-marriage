import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { markWhatsappShared, whatsappPreview } from "@/modules/guest-access/whatsapp";

export async function POST(request: NextRequest, context: RouteContext<"/api/v1/weddings/[id]/invitations/whatsapp-preview">) {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
  try {
    trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const mode = request.nextUrl.searchParams.toString();
    if (mode && mode !== "action=mark-shared") throw new AccountError(400, "INVALID_ACTION", "Choose a supported sharing action.");
    await rateLimit(mode ? "whatsapp-mark-shared" : "whatsapp-preview", user._id.toString(), 60);
    const { id } = await context.params;
    const input = await body(request, 4096);
    const data = mode ? await markWhatsappShared(user, id, input) : await whatsappPreview(user, id, input);
    return NextResponse.json({ data, requestId }, { headers });
  } catch (error) {
    const known = error instanceof AccountError;
    const status = known ? error.status : error instanceof ZodError ? 422 : 503;
    return NextResponse.json({ error: {
      code: known ? error.code : "WHATSAPP_UNAVAILABLE",
      message: known ? error.message : "Could not prepare WhatsApp sharing. Please retry.",
    }, requestId }, { status, headers });
  }
}
