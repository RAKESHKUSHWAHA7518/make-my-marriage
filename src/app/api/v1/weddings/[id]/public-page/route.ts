import type { NextRequest } from "next/server";
import { handleWebsite } from "@/modules/website/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return handleWebsite(request, "read", (await context.params).id); }
export async function PATCH(request: NextRequest, context: Context) { return handleWebsite(request, "save", (await context.params).id); }
