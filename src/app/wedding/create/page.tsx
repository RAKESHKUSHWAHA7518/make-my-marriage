import type { Metadata } from "next";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, currentWedding } from "@/modules/weddings/service";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
import {
  WorkspaceShell,
  WeddingGate,
} from "@/components/weddings/workspace-shell";
import { CreateWeddingForm } from "@/components/weddings/create-wedding-form";
export const metadata: Metadata = {
  title: "Create your wedding | Make My Marriage",
};
export const dynamic = "force-dynamic";
export default async function CreatePage() {
  const user = await weddingUser();
  const membership = await membershipFor(user);
  const wedding =
    membership?.status === "active" ? await currentWedding(user) : null;
  const gate = membership
    ? membership.status === "removed"
      ? "removed"
      : "existing"
    : !user.emailVerifiedAt
      ? "unverified"
      : null;
  return (
    <WorkspaceShell name={user.displayName}>
      {gate ? (
        <WeddingGate kind={gate} email={user.email} title={wedding?.title} />
      ) : (
        <main className="wedding-create">
          <div className="wedding-intro">
            <span className="wedding-kicker">
              <WeddingIcon name="heart" /> Workspace initiation
            </span>
            <h1>Let’s create your wedding</h1>
            <p>Set up your private wedding workspace in one calm place.</p>
          </div>
          <CreateWeddingForm
            timezones={[
              ...new Set([
                "Asia/Kolkata",
                ...Intl.supportedValuesOf("timeZone"),
              ]),
            ]}
          />
        </main>
      )}
    </WorkspaceShell>
  );
}
