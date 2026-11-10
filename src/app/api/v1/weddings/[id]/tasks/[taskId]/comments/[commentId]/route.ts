import type { NextRequest } from "next/server";
import { handleTaskComments } from "@/modules/tasks/comments-http";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; taskId: string; commentId: string }> }) {
  const { id, taskId, commentId } = await context.params;
  return handleTaskComments(request, "patch", id, taskId, commentId);
}
