import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, weddingFor } from "@/modules/weddings/service";
import { displayBudget } from "@/modules/weddings/schema";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
import { WeddingCountdown } from "@/components/weddings/wedding-countdown";
import { daysUntilWedding } from "@/modules/weddings/countdown";
import {
  WorkspaceShell,
  WeddingGate,
} from "@/components/weddings/workspace-shell";
export const metadata: Metadata = { title: "Your wedding | Make My Marriage" };
export const dynamic = "force-dynamic";
export default async function WeddingPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const updated = (await searchParams).updated === "1";
  const user = await weddingUser();
  const membership = await membershipFor(user);
  if (!membership) redirect("/wedding/create");
  if (membership.status === "removed")
    return (
      <WorkspaceShell name={user.displayName}>
        <WeddingGate kind="removed" />
      </WorkspaceShell>
    );
  const wedding = await weddingFor(user);
  if (!wedding) throw new Error("Wedding unavailable");
  const date = wedding.weddingDate
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${wedding.weddingDate}T00:00:00Z`))
    : "Date not decided";
  return (
    <WorkspaceShell name={user.displayName} role={wedding.role}>
      <main className="wedding-overview">
        <Link href="/account" className="wedding-back">
          <WeddingIcon name="back" />
          Back to account
        </Link>
        <Link href="/wedding/details" className="wedding-back">
          {wedding.state === "archived"
            ? "Wedding details"
            : "Edit wedding details"}{" "}
          <WeddingIcon name="edit" />
        </Link>
        <Link href="/wedding/family" className="wedding-back">
          Family &amp; access
        </Link>
        {updated && (
          <p className="wedding-notice wedding-success" role="status">
            Wedding details updated.
          </p>
        )}
        <div className="wedding-overview-intro">
          <div className="wedding-overview-heading">
            <div className="wedding-mobile-meta">
              <span className="wedding-role">{wedding.role}</span>
              <span>
                {wedding.state === "archived"
                  ? "Wedding archived"
                  : "Workspace active"}
              </span>
            </div>
            <span className="wedding-kicker">Your wedding workspace</span>
            <h1>{wedding.title}</h1>
            <p>Workspace overview and saved wedding details.</p>
          </div>
          {wedding.weddingDate && (
            <WeddingCountdown
              weddingDate={wedding.weddingDate}
              timezone={wedding.timezone}
              initialDays={daysUntilWedding(
                wedding.weddingDate,
                wedding.timezone,
                new Date(),
              )}
            />
          )}
        </div>
        <aside className="wedding-notice wedding-success">
          <span className="wedding-success-icon">
            <WeddingIcon name="bookmark" />
          </span>
          <div>
            <strong>Your wedding details are saved</strong>
            <p>Family invitations and event planning will follow.</p>
          </div>
        </aside>
        {wedding.state === "archived" && (
          <p className="wedding-notice">
            This wedding is archived and read-only.
          </p>
        )}
        <div className="wedding-overview-grid">
          <section className="wedding-card">
            <div className="wedding-card-heading">
              <h2>
                <WeddingIcon name="heart" />
                <span className="wedding-desktop-label">
                  Core Wedding Details
                </span>
                <span className="wedding-mobile-label">
                  Celebration Details
                </span>
              </h2>
              <span className="wedding-role">{wedding.role}</span>
            </div>
            <dl>
              <dt>Saved workspace title</dt>
              <dd>{wedding.title}</dd>
              <dt>Couple’s names</dt>
              <dd>
                {wedding.couple.brideName} &amp; {wedding.couple.groomName}
              </dd>
              <dt>Wedding date</dt>
              <dd className="wedding-date-value">
                <WeddingIcon name="calendar" />
                {date}
              </dd>
            </dl>
          </section>
          <section className="wedding-card">
            <h2>
              <WeddingIcon name="globe" />
              <span className="wedding-desktop-label">
                Planning &amp; Regional
              </span>
              <span className="wedding-mobile-label">
                Regional &amp; Financial Baseline
              </span>
            </h2>
            <dl>
              <dt>Time zone</dt>
              <dd>{wedding.timezone}</dd>
              <dt>Currency</dt>
              <dd>
                {wedding.currency} —{" "}
                {new Intl.DisplayNames(["en"], { type: "currency" }).of(
                  wedding.currency,
                )}
              </dd>
              <dt>Overall budget</dt>
              <dd>
                {wedding.budgetMinor !== undefined
                  ? displayBudget(wedding.budgetMinor, wedding.currency)
                  : "Budget not set"}
              </dd>
            </dl>
          </section>
          <section className="wedding-card">
            <h2>
              <WeddingIcon name="lock" />
              <span className="wedding-desktop-label">
                Privacy &amp; Website
              </span>
              <span className="wedding-mobile-label">Workspace Statuses</span>
            </h2>
            <dl>
              <dt>Public website status</dt>
              <dd>
                <span className="wedding-status">
                  {wedding.publicPage.state === "published"
                    ? "Published"
                    : "Unpublished"}
                </span>
              </dd>
              <dt>Gallery status</dt>
              <dd>
                <span className="wedding-status">
                  {wedding.gallery.isEnabled ? "Enabled" : "Not enabled"}
                </span>
              </dd>
              <dt>Privacy</dt>
              <dd>Access is limited to authorized wedding members.</dd>
            </dl>
          </section>
        </div>
      </main>
    </WorkspaceShell>
  );
}
