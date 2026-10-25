import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, weddingFor } from "@/modules/weddings/service";
import { displayBudget } from "@/modules/weddings/schema";
import { WorkspaceDashboard } from "@/components/weddings/workspace-dashboard";
import { WeddingCountdown } from "@/components/weddings/wedding-countdown";
import { daysUntilWedding } from "@/modules/weddings/countdown";
import { listEvents, type EventView } from "@/modules/events/service";
import { AccountError } from "@/modules/identity/security";
import {
  WorkspaceShell,
  WeddingGate,
} from "@/components/weddings/workspace-shell";
export const metadata: Metadata = { title: "Your wedding | Make My Marriage" };
export const dynamic = "force-dynamic";
export default async function WeddingPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; }>;
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
  let events: EventView[] = [];
  let eventsUnavailable = false;
  try { events = (await listEvents(user, wedding.id, { limit: 3, status: "draft" })).data; }
  catch (error) {
    if (!(error instanceof AccountError) || error.code !== "EVENTS_UNAVAILABLE") throw error;
    eventsUnavailable = true;
  }
  const date = wedding.weddingDate
    ? new Intl.DateTimeFormat("en-IN", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${wedding.weddingDate}T00:00:00Z`))
    : "Date not decided";
  return (
    <WorkspaceShell
      name={user.displayName}
      role={wedding.role}
      weddingTitle={wedding.title}
      activePage="overview"
    >
      <main className="workspace-main">
        {updated && <p className="wedding-notice wedding-success" role="status">Wedding details updated.</p>}
        <WorkspaceDashboard events={events} eventsUnavailable={eventsUnavailable} summary={{
          title: wedding.title,
          couple: wedding.couple.brideName + " & " + wedding.couple.groomName,
          date,
          timezone: wedding.timezone,
          currency: wedding.currency,
          budget: wedding.budgetMinor === undefined ? "Budget not set" : displayBudget(wedding.budgetMinor, wedding.currency),
          website: wedding.publicPage.state === "published" ? "Published" : "Unpublished",
          gallery: wedding.gallery.isEnabled ? "Enabled" : "Not enabled",
          role: wedding.role,
          archived: wedding.state === "archived",
        }} countdown={wedding.weddingDate ? <WeddingCountdown
          weddingDate={wedding.weddingDate}
          timezone={wedding.timezone}
          initialDays={daysUntilWedding(wedding.weddingDate, wedding.timezone, new Date())}
        /> : undefined} />
      </main>
    </WorkspaceShell>
  );
}
