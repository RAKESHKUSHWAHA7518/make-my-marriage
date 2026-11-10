import type { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await context.params;
  return handleWedding(request, "remove-event", id, eventId);
}
