import type { NextRequest } from "next/server";
import { handlePrivateAttachments } from "@/modules/media/attachments-http";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; expenseId: string; assetId: string }> }) {
  const { id, expenseId, assetId } = await context.params;
  return handlePrivateAttachments(request, "receipt", id, expenseId, assetId);
}
