import type { Metadata } from "next";
import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { eventFor } from "@/modules/events/service";
import { eventDate, eventTime, eventTypeLabels } from "@/modules/events/schema";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { ScheduleEvent } from "@/components/weddings/schedule-event";
import { WeddingIcon } from "@/components/weddings/wedding-icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event details | Make My Marriage" };
export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ created?: string; updated?: string; scheduled?: string }> }) {
  const { user, wedding } = await eventWorkspace();
  const event = await eventFor(user, wedding.id, (await params).eventId);
  const query = await searchParams;
  const created = query.created === "1", updated = query.updated === "1";
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="events">
    <main className="workspace-main events-page">
      <Link className="wedding-back" href="/wedding/events">← Back to events</Link>
      {!event ? <section className="workspace-panel event-empty"><WeddingIcon name="calendar" /><h1>Event unavailable</h1><p>This event could not be found or is no longer available.</p><Link className="button button-primary" href="/wedding/events">Back to events</Link></section> : <>
        {query.scheduled === "1" && event.status === "scheduled" && <p role="status" className="event-success">✓ Event scheduled. No invitations were sent and your public website was not published.</p>}
        {updated && <p role="status" className="event-success">✓ Event updated.</p>}
        {created && <p role="status" className="event-success">✓ Event saved as a draft.</p>}
        {wedding.state === "archived" && <p className="wedding-notice">This wedding is archived and read-only.</p>}
        <section className="workspace-panel event-detail-hero"><div className="event-badges"><span>{eventTypeLabels[event.type]}</span><span className="event-status">{event.status} · Private planning</span></div><h1>{event.name}</h1>{wedding.state === "active" && event.status === "draft" && <div className="event-form-actions"><Link className="button button-secondary" href={`/wedding/events/${event.id}/edit`}>Edit event</Link><ScheduleEvent key={event.id + ":" + event.version + ":" + wedding.timezone} weddingId={wedding.id} eventId={event.id} version={event.version} name={event.name} startsAt={event.startsAt} venue={event.venue.name} timezone={wedding.timezone} /></div>}{event.description && <p>{event.description}</p>}</section>
        <div className="event-detail-grid"><div>
          <section className="workspace-panel"><h2><WeddingIcon name="calendar" />Date &amp; time</h2><div className="event-time-grid"><div><small>Starts</small><strong>{eventDate(event.startsAt, wedding.timezone)}</strong><em>{eventTime(event.startsAt, wedding.timezone)}</em></div><div><small>Concludes</small>{event.endsAt ? <><strong>{eventDate(event.endsAt, wedding.timezone)}</strong><em>{eventTime(event.endsAt, wedding.timezone)}</em></> : <strong>End time not decided</strong>}</div></div><p className="event-timezone"><WeddingIcon name="globe" />Timezone: {wedding.timezone}</p></section>
          <section className="workspace-panel"><h2><WeddingIcon name="bookmark" />Notes &amp; dress code</h2><dl className="event-notes"><div><dt>Dress code</dt><dd>{event.dressCode || "Not provided"}</dd></div><div><dt>Description</dt><dd>{event.description || "Not provided"}</dd></div></dl></section>
        </div><div><section className="workspace-panel"><h2><WeddingIcon name="pin" />Celebration venue</h2><h3>{event.venue.name}</h3><p>{event.venue.address}</p>{event.venue.mapUrl && <a className="button button-secondary event-map-link" href={event.venue.mapUrl} target="_blank" rel="noopener noreferrer">Open venue map ↗</a>}</section><aside className="event-privacy"><WeddingIcon name="lock" /><p>{event.status === "draft" ? "This draft is visible to your planning family. It has not been shared with guests or published publicly." : "Guest visibility depends on explicit event invitations. Public wedding information is published separately."}</p></aside></div></div>
      </>}
    </main>
  </WorkspaceShell>;
}
