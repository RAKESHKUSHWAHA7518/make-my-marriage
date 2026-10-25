import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName } from "./http";
import { currentUser } from "./service";

export async function redirectSignedInUser() {
  const jar = await cookies();
  // Credential-free previews remain available when there is no session cookie.
  if (!jar.has("mmm_session") && !jar.has("__Host-mmm_session")) return;
  if (await currentUser(jar.get(cookieName())?.value)) redirect("/wedding");
}
