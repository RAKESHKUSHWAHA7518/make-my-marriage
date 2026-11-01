import type { NextRequest } from "next/server";
import { handlePublicWebsite } from "@/modules/website/public-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) { return handlePublicWebsite(request, (await context.params).slug); }
