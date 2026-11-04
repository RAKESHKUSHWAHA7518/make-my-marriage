import { NextRequest } from "next/server";
import { handlePublication } from "@/modules/designs/publication-http";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; designId: string }> }) { const p = await context.params; return handlePublication(request, "versions", p.id, p.designId); }
