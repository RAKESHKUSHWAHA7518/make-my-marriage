import { NextRequest } from "next/server";
import { handleDesigns } from "@/modules/designs/http";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; designId: string }> }) { const p = await context.params; return handleDesigns(request, "get", p.id, p.designId); }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; designId: string }> }) { const p = await context.params; return handleDesigns(request, "patch", p.id, p.designId); }
