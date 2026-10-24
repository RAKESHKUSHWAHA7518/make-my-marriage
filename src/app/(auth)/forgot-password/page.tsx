import type { Metadata } from "next";
import { AccountForm } from "@/components/auth/account-form";

export const metadata: Metadata = {
  title: "Forgot password | Make My Marriage",
};

export default function ForgotPasswordPage() {
  return <AccountForm mode="forgot-password" />;
}
