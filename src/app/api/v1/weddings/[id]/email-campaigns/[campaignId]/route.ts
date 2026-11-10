import { NextRequest } from "next/server";
import { handleInvitationEmail } from "@/modules/invitation-email/http";

export async function GET(request: NextRequest, context: RouteContext<"/api/v1/weddings/[id]/email-campaigns/[campaignId]">) {
  const { id, campaignId } = await context.params;
  return handleInvitationEmail(request, id, "get", campaignId);
}
