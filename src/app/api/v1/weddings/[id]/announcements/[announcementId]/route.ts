import type { NextRequest } from "next/server";
import { handleAnnouncements } from "@/modules/announcements/http";
export const runtime = "nodejs";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; announcementId: string }> }) { const { id, announcementId } = await context.params; return handleAnnouncements(request, "patch", id, announcementId); }
