import type { NextRequest } from "next/server";
import { handleWebsite } from "@/modules/website/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleWebsite(request, "unpublish", (await context.params).id); }
