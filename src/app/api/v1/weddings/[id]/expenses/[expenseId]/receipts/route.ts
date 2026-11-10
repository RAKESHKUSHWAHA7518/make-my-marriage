import type { NextRequest } from "next/server";
import { handlePrivateAttachments } from "@/modules/media/attachments-http";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; expenseId: string }> }) {
  const { id, expenseId } = await context.params;
  return handlePrivateAttachments(request, "receipt", id, expenseId);
}
