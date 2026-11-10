import { NextRequest } from "next/server";
import { handleInvitationEmail } from "@/modules/invitation-email/http";

export async function POST(request: NextRequest, context: RouteContext<"/api/v1/weddings/[id]/email-campaigns">) {
  return handleInvitationEmail(request, (await context.params).id, "queue");
}
