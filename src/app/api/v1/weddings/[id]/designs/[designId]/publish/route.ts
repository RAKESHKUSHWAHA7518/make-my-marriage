import { NextRequest } from "next/server";
import { handlePublication } from "@/modules/designs/publication-http";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; designId: string }> }) { const p = await context.params; return handlePublication(request, "publish", p.id, p.designId); }
