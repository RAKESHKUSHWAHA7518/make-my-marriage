import { NextRequest } from "next/server";
import { handleDesigns } from "@/modules/designs/http";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleDesigns(request, "list", (await context.params).id); }
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleDesigns(request, "create", (await context.params).id); }
