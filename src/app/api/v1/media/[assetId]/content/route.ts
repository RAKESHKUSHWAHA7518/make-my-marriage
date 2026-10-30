import type { NextRequest } from "next/server";
import { handleMedia } from "@/modules/media/http";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: NextRequest, {params}: {params: Promise<{assetId:string;}>} ) { const p = await params; return handleMedia(request,"content", p.assetId); }
