import type { NextRequest } from "next/server";
import { handleAnnouncements } from "@/modules/announcements/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return handleAnnouncements(request, "list", (await context.params).id); }
export async function POST(request: NextRequest, context: Context) { return handleAnnouncements(request, "create", (await context.params).id); }
