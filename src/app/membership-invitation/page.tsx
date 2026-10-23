import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cookieName } from "@/modules/identity/http";
import { currentUser } from "@/modules/identity/service";
import { Brand } from "@/components/brand";
import { AcceptFamilyInvitation } from "@/components/weddings/accept-family-invitation";
export const metadata: Metadata = {
  title: "Wedding invitation | Make My Marriage",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function MembershipInvitationPage() {
  const user = await currentUser((await cookies()).get(cookieName())?.value);
  return (
    <div className="wedding-shell">
      <header className="wedding-header">
        <Brand />
      </header>
      <main className="wedding-create">
        <AcceptFamilyInvitation email={user?.email} />
      </main>
    </div>
  );
}
