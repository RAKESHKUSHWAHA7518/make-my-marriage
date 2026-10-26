import "server-only";
import { cookies } from "next/headers";
import { AccountError } from "@/modules/identity/security";
import { householdCookieName } from "./http";
import { guestSite } from "./service";
export async function guestPageSite() {
  try { return await guestSite((await cookies()).get(householdCookieName())?.value); }
  catch (error) { if (error instanceof AccountError && error.status === 404) return null; throw error; }
}
