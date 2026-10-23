import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/modules/identity/service";
import { cookieName } from "@/modules/identity/http";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/auth/logout-button";
import { membershipFor } from "@/modules/weddings/service";

export const metadata: Metadata = { title: "Your account | Make My Marriage" };
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const jar = await cookies();
  const user = await currentUser(jar.get(cookieName())?.value);
  if (!user) redirect("/login");
  const membership = await membershipFor(user);
  return (
    <main className="shell section" style={{ maxWidth: 720 }}>
      <Brand />
      <h1 style={{ marginTop: 48, fontSize: 44 }}>
        Welcome, {user.displayName}
      </h1>
      <p style={{ marginBlock: 24 }}>
        {user.emailVerifiedAt
          ? "Your email is verified. Your account is ready."
          : "Please verify your email before creating a wedding or inviting family."}
      </p>
      {!user.emailVerifiedAt && (
        <p>
          <Link href="/verify-email" className="button">
            Resend verification email →
          </Link>
        </p>
      )}
      <div style={{ marginBlock: 24 }}>
        {membership?.status === "removed" ? (
          <p>
            Wedding access is unavailable. Contact a wedding administrator. Your
            account remains associated with this wedding.
          </p>
        ) : membership ? (
          <Link className="button button-primary" href="/wedding">
            Open your wedding →
          </Link>
        ) : user.emailVerifiedAt ? (
          <Link className="button button-primary" href="/wedding/create">
            Create your wedding →
          </Link>
        ) : (
          <p>Wedding setup becomes available after email verification.</p>
        )}
      </div>
      <LogoutButton />
    </main>
  );
}
