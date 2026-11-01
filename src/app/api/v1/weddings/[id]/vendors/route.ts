import type { NextRequest } from "next/server";
import { handleVendors } from "@/modules/vendors/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return handleVendors(request, "list", (await context.params).id); }
export async function POST(request: NextRequest, context: Context) { return handleVendors(request, "create", (await context.params).id); }
