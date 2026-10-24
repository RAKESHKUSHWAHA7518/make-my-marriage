import type { Metadata } from "next";
import { AccountForm } from "@/components/auth/account-form";

export const metadata: Metadata = { title: "Verify email | Make My Marriage" };

export default function VerifyEmailPage() {
  return <AccountForm mode="verify-email" />;
}
