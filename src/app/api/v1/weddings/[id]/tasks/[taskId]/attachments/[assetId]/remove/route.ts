import type { NextRequest } from "next/server";
import { handlePrivateAttachments } from "@/modules/media/attachments-http";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; taskId: string; assetId: string }> }) {
  const { id, taskId, assetId } = await context.params;
  return handlePrivateAttachments(request, "task_attachment", id, taskId, assetId);
}
