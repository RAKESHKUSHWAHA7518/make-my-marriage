import type { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleWedding(request, "list-events", (await context.params).id);
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleWedding(request, "create-event", (await context.params).id);
}
