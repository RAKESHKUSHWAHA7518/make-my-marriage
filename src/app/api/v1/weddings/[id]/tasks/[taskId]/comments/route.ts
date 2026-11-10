import type { NextRequest } from "next/server";
import { handleTaskComments } from "@/modules/tasks/comments-http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; taskId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id, taskId } = await context.params;
  return handleTaskComments(request, "list", id, taskId);
}

export async function POST(request: NextRequest, context: Context) {
  const { id, taskId } = await context.params;
  return handleTaskComments(request, "create", id, taskId);
}
