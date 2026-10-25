import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return handleWedding(request, "list-households", (await context.params).id); }
export async function POST(request: NextRequest, context: Context) { return handleWedding(request, "create-household", (await context.params).id); }
