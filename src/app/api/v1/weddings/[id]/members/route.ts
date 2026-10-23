import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleWedding(request, "members", (await context.params).id);
}
