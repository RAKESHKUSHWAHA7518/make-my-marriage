import type { NextRequest } from "next/server";
import { handleWebsite } from "@/modules/website/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleWebsite(request, "publish", (await context.params).id); }
