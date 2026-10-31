import type { NextRequest } from "next/server";
import { handleExpenses } from "@/modules/expenses/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return handleExpenses(request, "list", (await context.params).id); }
export async function POST(request: NextRequest, context: Context) { return handleExpenses(request, "create", (await context.params).id); }
