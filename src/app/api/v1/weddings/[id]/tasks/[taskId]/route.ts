import type { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; taskId?: string }> }) {
 const { id, taskId } = await context.params;
 return handleWedding(request, "task-detail", id, taskId);
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; taskId?: string }> }) {
 const { id, taskId } = await context.params;
 return handleWedding(request, "update-task", id, taskId);
}
