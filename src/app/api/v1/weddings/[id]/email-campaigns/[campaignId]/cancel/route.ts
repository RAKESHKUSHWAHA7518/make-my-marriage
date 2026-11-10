import { NextRequest } from "next/server";
import { handleInvitationEmail } from "@/modules/invitation-email/http";

export async function POST(request: NextRequest, context: RouteContext<"/api/v1/weddings/[id]/email-campaigns/[campaignId]/cancel">) {
  const { id, campaignId } = await context.params;
  return handleInvitationEmail(request, id, "cancel", campaignId);
}
