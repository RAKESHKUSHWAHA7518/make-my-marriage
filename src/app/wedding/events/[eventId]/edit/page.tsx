import type { Metadata } from "next";
import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { eventFor } from "@/modules/events/service";
import { eventDate, eventTime } from "@/modules/events/schema";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { EventForm } from "@/components/weddings/event-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit event | Make My Marriage" };
export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { user, wedding } = await eventWorkspace();
  const event = await eventFor(user, wedding.id, (await params).eventId);
  const back = event ? `/wedding/events/${event.id}` : "/wedding";
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="events">
    <main className="workspace-main events-page event-edit-page">
      <Link className="wedding-back" href={back}>← {event ? "Back to event" : "Back to workspace"}</Link>
      {!event ? <section className="workspace-panel event-empty"><h1>Event unavailable</h1><p>This event is unavailable, or you no longer have permission to view it.</p></section>
        : wedding.state !== "active" || event.status !== "draft" ? <section className="workspace-panel event-empty"><h1>{event.name}</h1><p>{wedding.state !== "active" ? "This wedding is archived. Event details are read-only." : "Only draft events can be edited in this phase."}</p><Link className="button button-primary" href={back}>View event details</Link></section>
        : <><header className="event-page-heading"><div><span className="event-status">Draft · Private</span><h1>Edit event</h1><p>Update the details of your private draft.</p></div></header>
          <div className="event-edit-layout"><EventForm key={event.id + ":" + event.version + ":" + wedding.timezone} weddingId={wedding.id} timezone={wedding.timezone} initial={event} />
            <aside className="event-edit-summary"><section className="workspace-panel"><small>SUMMARY &amp; STATUS</small><span className="event-status">Draft</span><h2>{event.name}</h2><p>{eventDate(event.startsAt, wedding.timezone)} · {eventTime(event.startsAt, wedding.timezone)}{event.endsAt ? " – " + eventTime(event.endsAt, wedding.timezone) : ""}</p><p>{event.venue.name}</p><p className="event-timezone">{wedding.timezone}</p><div className="event-privacy">Only planning family members can view and edit this draft. No guest notifications are sent.</div></section></aside>
          </div></>}
    </main>
  </WorkspaceShell>;
}
