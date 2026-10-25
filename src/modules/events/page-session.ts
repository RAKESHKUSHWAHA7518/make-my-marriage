import "server-only";
import { redirect } from "next/navigation";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, weddingFor } from "@/modules/weddings/service";

export async function eventWorkspace() {
  const user = await weddingUser();
  const membership = await membershipFor(user);
  if (!membership) redirect("/wedding/create");
  if (membership.status !== "active") redirect("/wedding");
  const wedding = await weddingFor(user);
  if (!wedding) redirect("/account");
  return { user, wedding };
}
