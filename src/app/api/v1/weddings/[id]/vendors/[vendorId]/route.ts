import type { NextRequest } from "next/server";
import { handleVendors } from "@/modules/vendors/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; vendorId: string }> };
export async function GET(request: NextRequest, context: Context) { const { id, vendorId } = await context.params; return handleVendors(request, "detail", id, vendorId); }
export async function PATCH(request: NextRequest, context: Context) { const { id, vendorId } = await context.params; return handleVendors(request, "update", id, vendorId); }
