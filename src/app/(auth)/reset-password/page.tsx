import type { Metadata } from "next";
import { AccountForm } from "@/components/auth/account-form";

export const metadata: Metadata = {
  title: "Reset password | Make My Marriage",
};

export default function ResetPasswordPage() {
  return <AccountForm mode="reset-password" />;
}
