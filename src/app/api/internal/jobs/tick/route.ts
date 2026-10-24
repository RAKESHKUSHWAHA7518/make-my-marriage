import { NextRequest, NextResponse } from "next/server";
import { authorizedScheduler } from "@/modules/identity/http";
import { sendAccountEmails } from "@/infrastructure/resend/account-mail";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  if (!authorizedScheduler(request))
    return new NextResponse(null, { status: 401 });
  try {
    return NextResponse.json(
      { data: await sendAccountEmails() },
      { headers: { "Cache-Control": "no-store" } },
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
