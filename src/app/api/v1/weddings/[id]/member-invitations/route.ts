import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleWedding(request, "invite", (await context.params).id);
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleWedding(request, "invitations", (await context.params).id);
}
