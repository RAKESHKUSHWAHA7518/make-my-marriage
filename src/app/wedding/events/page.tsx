import type { Metadata } from "next";
import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { listEvents } from "@/modules/events/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
import { EventCard } from "@/components/weddings/event-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your celebrations | Make My Marriage" };
const historyStatuses = ["completed", "cancelled", "removed"] as const;
const historyLabels = { completed: "Completed", cancelled: "Cancelled", removed: "Removed" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ cursor?: string; status?: string }> }) {
  const { user, wedding } = await eventWorkspace();
  const { cursor, status: requestedStatus } = await searchParams;
  const status = historyStatuses.find(value => value === requestedStatus);
  const page = status ? `/wedding/events?status=${status}` : "/wedding/events";
  const events = await listEvents(user, wedding.id, { cursor, status });
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="events">
    <main className="workspace-main events-page">
      <aside className="event-privacy"><WeddingIcon name="lock" /><p><strong>Event visibility</strong> Drafts are for your planning family. Scheduled and completed events can be viewed by invited households. Cancelled and removed events are hidden from guests.</p></aside>
      <div className="event-page-heading"><div><span className="wedding-kicker">Itinerary &amp; schedule</span><h1>Your celebrations</h1><p>Keep every wedding event together, from the first gathering to the final celebration.</p></div>{wedding.state === "active" && <Link href="/wedding/events/new" className="button button-primary">+ Create event</Link>}</div>
      {wedding.state === "archived" && <p className="wedding-notice">This wedding is archived. Events are viewable but cannot be created.</p>}
      <nav className="event-form-actions event-lifecycle-actions" aria-label="Event history filters">
        <Link className="button button-secondary" href="/wedding/events" aria-current={!status ? "page" : undefined}>Celebrations</Link>
        {historyStatuses.map(value => <Link key={value} className="button button-secondary" href={`/wedding/events?status=${value}`} aria-current={status === value ? "page" : undefined}>{historyLabels[value]}</Link>)}
      </nav>
      {status && <h2>{historyLabels[status]} event history</h2>}
      <div className="event-list-caption"><span>Chronological sequence</span><span><WeddingIcon name="clock" />All times in {wedding.timezone}</span></div>
      {events.data.length ? <div className="event-list">{events.data.map((event) => <EventCard key={event.id} event={event} timezone={wedding.timezone} />)}</div> : <section className="workspace-panel workspace-empty event-empty"><span><WeddingIcon name="calendar" /></span><h2>{cursor ? "No more events on this page" : status ? `No ${status} events` : "Every celebration starts somewhere"}</h2><p>{cursor ? "Return to the first page to see your saved events." : status ? "Events with this status will appear here." : "Add your first event with its date, time and venue."}</p>{wedding.state === "active" && !cursor && !status && <Link className="button button-primary" href="/wedding/events/new">Create your first event</Link>}</section>}
      <nav className="event-pagination" aria-label="Event pages">{cursor && <Link href={page}>Back to first page</Link>}{events.pagination.nextCursor && <Link href={`${page}${status ? "&" : "?"}cursor=${encodeURIComponent(events.pagination.nextCursor)}`}>More events →</Link>}</nav>
    </main>
  </WorkspaceShell>;
}
