import type { Metadata } from "next";
import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { listEvents } from "@/modules/events/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
import { EventCard } from "@/components/weddings/event-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your celebrations | Make My Marriage" };
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { user, wedding } = await eventWorkspace();
  const { cursor } = await searchParams;
  const events = await listEvents(user, wedding.id, cursor ? { cursor } : {});
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="events">
    <main className="workspace-main events-page">
      <aside className="event-privacy"><WeddingIcon name="lock" /><p><strong>Event visibility</strong> Drafts are for your planning family. Scheduled events are eligible only for explicitly invited households. Scheduling does not send invitations or publish your public website. Guest access will follow in a later feature.</p></aside>
      <div className="event-page-heading"><div><span className="wedding-kicker">Itinerary &amp; schedule</span><h1>Your celebrations</h1><p>Keep every wedding event together, from the first gathering to the final celebration.</p></div>{wedding.state === "active" && <Link href="/wedding/events/new" className="button button-primary">+ Create event</Link>}</div>
      {wedding.state === "archived" && <p className="wedding-notice">This wedding is archived. Events are viewable but cannot be created.</p>}
      <div className="event-list-caption"><span>Chronological sequence</span><span><WeddingIcon name="clock" />All times in {wedding.timezone}</span></div>
      {events.data.length ? <div className="event-list">{events.data.map((event) => <EventCard key={event.id} event={event} timezone={wedding.timezone} />)}</div> : <section className="workspace-panel workspace-empty event-empty"><span><WeddingIcon name="calendar" /></span><h2>{cursor ? "No more events on this page" : "Every celebration starts somewhere"}</h2><p>{cursor ? "Return to the first page to see your saved events." : "Add your first event with its date, time and venue."}</p>{wedding.state === "active" && !cursor && <Link className="button button-primary" href="/wedding/events/new">Create your first event</Link>}</section>}
      <nav className="event-pagination" aria-label="Event pages">{cursor && <Link href="/wedding/events">Back to first page</Link>}{events.pagination.nextCursor && <Link href={`/wedding/events?cursor=${encodeURIComponent(events.pagination.nextCursor)}`}>More events →</Link>}</nav>
    </main>
  </WorkspaceShell>;
}
