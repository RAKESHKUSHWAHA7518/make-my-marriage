import type { NextRequest } from "next/server";
import { handleExpenses } from "@/modules/expenses/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleExpenses(request, "summary", (await context.params).id); }
