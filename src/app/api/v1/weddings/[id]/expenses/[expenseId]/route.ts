import type { NextRequest } from "next/server";
import { handleExpenses } from "@/modules/expenses/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; expenseId: string }> };
export async function GET(request: NextRequest, context: Context) { const { id, expenseId } = await context.params; return handleExpenses(request, "detail", id, expenseId); }
export async function PATCH(request: NextRequest, context: Context) { const { id, expenseId } = await context.params; return handleExpenses(request, "update", id, expenseId); }
