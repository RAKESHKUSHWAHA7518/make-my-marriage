import type { NextRequest } from "next/server";
import { handleGalleryAccess } from "@/modules/media/gallery-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleGalleryAccess(request, "read", (await context.params).id); }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleGalleryAccess(request, "settings", (await context.params).id); }
