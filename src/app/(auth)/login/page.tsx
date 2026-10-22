import type { Metadata } from "next";
import { AccountForm } from "@/components/auth/account-form";
import { redirectSignedInUser } from "@/modules/identity/page-session";

export const metadata: Metadata = { title: "Log in | Make My Marriage" };

export default async function LoginPage() {
  await redirectSignedInUser();
  return <AccountForm mode="login" />;
}
