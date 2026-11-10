import type { NextRequest } from "next/server";
import { handlePrivateAttachments } from "@/modules/media/attachments-http";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await context.params;
  return handlePrivateAttachments(request, "task_attachment", id, taskId);
}
