import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export const GET = (request: NextRequest) => handleWedding(request, "current");
