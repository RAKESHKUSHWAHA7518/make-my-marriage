import type { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await context.params;
  return handleWedding(request, "event-detail", id, eventId);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await context.params;
  return handleWedding(request, "update-event", id, eventId);
}
