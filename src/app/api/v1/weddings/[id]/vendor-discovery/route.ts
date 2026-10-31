import { NextRequest } from "next/server";
import { handleDiscovery } from "@/modules/vendors/discovery-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleDiscovery(request, (await context.params).id); }
