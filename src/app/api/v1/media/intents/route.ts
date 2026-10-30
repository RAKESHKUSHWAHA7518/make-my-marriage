import type { NextRequest } from "next/server";
import { handleMedia } from "@/modules/media/http";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest) {  return handleMedia(request,"create"); }
