import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; membershipId: string }> },
) {
  const params = await context.params;
  return handleWedding(request, "change-role", params.id, params.membershipId);
}
