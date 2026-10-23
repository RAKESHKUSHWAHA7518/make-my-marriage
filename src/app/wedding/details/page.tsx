import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, weddingFor } from "@/modules/weddings/service";
import {
  WorkspaceShell,
  WeddingGate,
} from "@/components/weddings/workspace-shell";
import { CreateWeddingForm } from "@/components/weddings/create-wedding-form";
import { displayBudget } from "@/modules/weddings/schema";

export const metadata: Metadata = {
  title: "Wedding details | Make My Marriage",
};
export const dynamic = "force-dynamic";
export default async function WeddingDetailsPage() {
  const user = await weddingUser();
  const membership = await membershipFor(user);
  if (!membership) redirect("/wedding/create");
  if (membership.status !== "active")
    return (
      <WorkspaceShell name={user.displayName}>
        <WeddingGate kind="removed" />
      </WorkspaceShell>
    );
  const wedding = await weddingFor(user);
  if (!wedding) redirect("/account");
  if (wedding.state === "archived")
    return (
      <WorkspaceShell name={user.displayName} role={wedding.role}>
        <main className="wedding-create">
          <div className="wedding-intro">
            <h1>Wedding details</h1>
            <p>This wedding is archived. Wedding details cannot be edited.</p>
            <section className="wedding-card">
              <h2>{wedding.title}</h2>
              <dl>
                <dt>Couple’s names</dt>
                <dd>
                  {wedding.couple.brideName} &amp; {wedding.couple.groomName}
                </dd>
                <dt>Wedding date</dt>
                <dd>{wedding.weddingDate ?? "Date not decided"}</dd>
                <dt>Time zone</dt>
                <dd>{wedding.timezone}</dd>
                <dt>Currency</dt>
                <dd>{wedding.currency}</dd>
                <dt>Overall budget</dt>
                <dd>
                  {wedding.budgetMinor === undefined
                    ? "Budget not set"
                    : displayBudget(wedding.budgetMinor, wedding.currency)}
                </dd>
              </dl>
            </section>
            <Link href="/wedding" className="button button-primary">
              View saved details
            </Link>
          </div>
        </main>
      </WorkspaceShell>
    );
  return (
    <WorkspaceShell name={user.displayName} role={wedding.role}>
      <main className="wedding-create">
        <div className="wedding-intro">
          <span className="wedding-kicker">Your wedding workspace</span>
          <h1>Wedding details</h1>
          <p>Keep your wedding workspace details up to date.</p>
        </div>
        <CreateWeddingForm
          wedding={wedding}
          timezones={[
            ...new Set([
              wedding.timezone,
              "Asia/Kolkata",
              ...Intl.supportedValuesOf("timeZone"),
            ]),
          ]}
        />
      </main>
    </WorkspaceShell>
  );
}
