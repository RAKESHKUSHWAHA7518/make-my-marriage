import type { NextRequest } from "next/server";
import { handleWedding } from "@/modules/weddings/http";
export const runtime="nodejs";
export async function POST(request:NextRequest,context:{params:Promise<{id:string;householdId:string}>}){const {id,householdId}=await context.params;return handleWedding(request,"household-link",id,householdId);}
