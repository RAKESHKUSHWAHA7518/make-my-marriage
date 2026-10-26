import type { NextRequest } from "next/server";
import { handleGuest } from "@/modules/guest-access/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { return handleGuest(request,"events"); }
