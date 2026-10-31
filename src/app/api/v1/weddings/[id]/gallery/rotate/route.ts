import type { NextRequest } from "next/server";
import { handleGalleryAccess } from "@/modules/media/gallery-http";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return handleGalleryAccess(request, "rotate", (await context.params).id); }
