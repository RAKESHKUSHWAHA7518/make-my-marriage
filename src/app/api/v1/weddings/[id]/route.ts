import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleWedding(request, "update", (await context.params).id);
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleWedding(request, "settings", (await context.params).id);
}
