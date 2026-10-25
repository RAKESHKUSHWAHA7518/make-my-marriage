import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; householdId: string }> };
export async function GET(request: NextRequest, context: Context) { const p = await context.params; return handleWedding(request, "household-detail", p.id, p.householdId); }
export async function PATCH(request: NextRequest, context: Context) { const p = await context.params; return handleWedding(request, "update-household", p.id, p.householdId); }
