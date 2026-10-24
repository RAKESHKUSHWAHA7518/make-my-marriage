import type { Metadata } from "next";
import { AccountForm } from "@/components/auth/account-form";
import { redirectSignedInUser } from "@/modules/identity/page-session";

export const metadata: Metadata = {
  title: "Create an account | Make My Marriage",
};

export default async function RegisterPage() {
  await redirectSignedInUser();
  return <AccountForm mode="register" />;
}
