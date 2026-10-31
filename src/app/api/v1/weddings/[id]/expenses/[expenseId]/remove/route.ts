import type { NextRequest } from "next/server";
import { handleExpenses } from "@/modules/expenses/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; expenseId: string }> }) { const { id, expenseId } = await context.params; return handleExpenses(request, "remove", id, expenseId); }
