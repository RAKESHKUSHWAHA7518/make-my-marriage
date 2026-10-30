import { NextRequest, NextResponse } from "next/server";
import { authorizedScheduler } from "@/modules/identity/http";
import { sendAccountEmails } from "@/infrastructure/resend/account-mail";

import { reconcileMedia } from "@/modules/media/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  if (!authorizedScheduler(request))
    return new NextResponse(null, { status: 401 });
  try {
    const [email, media] = await Promise.allSettled([sendAccountEmails(), reconcileMedia()]);
    return NextResponse.json(
      { data: { email: email.status === "fulfilled" ? email.value : { unavailable: true }, media: media.status === "fulfilled" ? media.value : { unavailable: true } } },
      { status: email.status === "rejected" || media.status === "rejected" || (media.status === "fulfilled" && media.value.failed > 0) ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Account email processing unavailable.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
