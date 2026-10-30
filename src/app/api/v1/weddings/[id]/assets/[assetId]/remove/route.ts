import type { NextRequest } from "next/server";
import { handleMedia } from "@/modules/media/http";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest, {params}: {params: Promise<{assetId:string;id:string;}>} ) { const p = await params; return handleMedia(request,"remove", p.assetId,p.id); }
