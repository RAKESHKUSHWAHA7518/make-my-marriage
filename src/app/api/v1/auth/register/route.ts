import { NextRequest } from "next/server";
import { handleAccount } from "@/modules/identity/http";

export const runtime = "nodejs";
export const POST = (request: NextRequest) =>
  handleAccount(request, "register");
