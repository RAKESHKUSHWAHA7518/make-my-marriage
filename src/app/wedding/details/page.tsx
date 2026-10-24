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
import { WeddingIcon } from "@/components/weddings/wedding-icon";

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
  if (wedding.state === "archived" || wedding.role !== "ADMIN")
    return (
      <WorkspaceShell
        name={user.displayName}
        role={wedding.role}
        weddingTitle={wedding.title}
        activePage="details"
      >
        <main className="wedding-create wedding-details-page wedding-details-readonly">
          <div className="wedding-intro">
            <span className="wedding-kicker">Your wedding workspace</span>
            <h1>Wedding details</h1>
            <p>A little clarity for the celebration ahead.</p>
          </div>
          <aside className="wedding-notice wedding-readonly-notice">
            <WeddingIcon name="lock" />
            <div>
              <strong>
                {wedding.state === "archived" ? "Archived wedding" : "View-only access"}
              </strong>
              <p>
                {wedding.state === "archived"
                  ? "This wedding is archived. Wedding details cannot be edited."
                  : "Everything you need to stay in the loop. An administrator can update these details."}
              </p>
            </div>
          </aside>
          <section
            className="wedding-card wedding-saved-details"
            aria-labelledby="saved-wedding-title"
          >
            <header className="wedding-saved-heading">
              <span className="wedding-saved-icon">
                <WeddingIcon name="heart" />
              </span>
              <div>
                <span className="wedding-saved-eyebrow">The celebration</span>
                <h2 id="saved-wedding-title">{wedding.title}</h2>
              </div>
              <span className="wedding-role">{wedding.role}</span>
            </header>
            <dl className="wedding-saved-grid">
              <div>
                <dt>Couple’s names</dt>
                <dd>
                  {wedding.couple.brideName} &amp; {wedding.couple.groomName}
                </dd>
              </div>
              <div>
                <dt>Wedding date</dt>
                <dd>
                  {wedding.weddingDate
                    ? new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "long",
                        timeZone: "UTC",
                      }).format(new Date(`${wedding.weddingDate}T00:00:00Z`))
                    : "Date not decided"}
                </dd>
              </div>
              <div>
                <dt>Time zone</dt>
                <dd>{wedding.timezone}</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{wedding.currency}</dd>
              </div>
              <div className="wedding-saved-budget">
                <dt>Overall budget</dt>
                <dd>
                  {wedding.budgetMinor === undefined
                    ? "Budget not set"
                    : displayBudget(wedding.budgetMinor, wedding.currency)}
                </dd>
              </div>
            </dl>
          </section>
          <div className="wedding-readonly-actions">
            <Link href="/wedding" className="button button-primary">
              <WeddingIcon name="back" /> Back to overview
            </Link>
          </div>
        </main>
      </WorkspaceShell>
    );
  return (
    <WorkspaceShell
      name={user.displayName}
      role={wedding.role}
      weddingTitle={wedding.title}
      activePage="details"
    >
      <main className="wedding-create wedding-details-page">
        <div className="wedding-intro">
          <span className="wedding-kicker">Your wedding workspace</span>
          <h1>Wedding details</h1>
          <p>Keep your wedding workspace details up to date.</p>
        </div>
        <div className="wedding-details-layout">
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
          <aside className="wedding-details-sidebar">
            <section className="wedding-card">
              <span className="wedding-kicker">Saved workspace</span>
              <h2>{wedding.title}</h2>
              <dl>
                <dt>Your role</dt>
                <dd>{wedding.role}</dd>
                <dt>Public website</dt>
                <dd>
                  {wedding.publicPage.state === "published"
                    ? "Published"
                    : "Unpublished"}
                </dd>
                <dt>Gallery</dt>
                <dd>{wedding.gallery.isEnabled ? "Enabled" : "Not enabled"}</dd>
              </dl>
            </section>
            <section className="wedding-card">
              <h2>Family &amp; access</h2>
              <p>
                Changing names does not invite anyone or change permissions.
              </p>
              <Link href="/wedding/family" className="wedding-back">
                Manage family access
              </Link>
            </section>
          </aside>
        </div>
      </main>
    </WorkspaceShell>
  );
}
