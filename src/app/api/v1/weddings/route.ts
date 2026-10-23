import { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime = "nodejs";
export const POST = (request: NextRequest) => handleWedding(request, "create");
