import { NextRequest } from "next/server";
import { handlePublication } from "@/modules/designs/publication-http";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; householdId: string }> }) { const p = await context.params; return handlePublication(request, "choices", p.id, p.householdId); }
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; householdId: string }> }) { const p = await context.params; return handlePublication(request, "select", p.id, p.householdId); }
