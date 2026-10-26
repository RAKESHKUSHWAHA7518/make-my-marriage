import type { NextRequest } from "next/server";
import { handleGuest } from "@/modules/guest-access/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { return handleGuest(request,"logout"); }
