import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return handleWedding(request, "accept-invite");
}
