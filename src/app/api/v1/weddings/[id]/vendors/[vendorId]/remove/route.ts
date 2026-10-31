import type { NextRequest } from "next/server";
import { handleVendors } from "@/modules/vendors/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; vendorId: string }> }) { const { id, vendorId } = await context.params; return handleVendors(request, "remove", id, vendorId); }
