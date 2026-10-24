import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName } from "@/modules/identity/http";
import { currentUser } from "@/modules/identity/service";
export async function weddingUser() {
  const jar = await cookies();
  const user = await currentUser(jar.get(cookieName())?.value);
  if (!user) redirect("/login");
  return user;
}
