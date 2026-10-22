import { NextRequest } from "next/server";
import { handleAccount } from "@/modules/identity/http";

export const runtime = "nodejs";
export const GET = (request: NextRequest) => handleAccount(request, "me");
