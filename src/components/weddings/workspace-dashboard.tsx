import Link from "next/link";
import type { ReactNode } from "react";
import { WeddingIcon } from "./wedding-icon";
import type { EventView } from "@/modules/events/service";
import { eventDate, eventTime } from "@/modules/events/schema";

type Summary = {
  title: string;
  couple: string;
  date: string;
  timezone: string;
  currency: string;
  budget: string;
  website: string;
  gallery: string;
  role: "ADMIN" | "MANAGER";
  archived: boolean;
};

export function WorkspaceDashboard({ summary, sample = false, countdown, events = [], eventsUnavailable = false }: {
  summary: Summary;
  sample?: boolean;
  countdown?: ReactNode;
  events?: EventView[];
  eventsUnavailable?: boolean;
}) {
  const metrics = [
    { title: "Household replies", icon: "mail", value: "42 / 60", detail: "18 sample households awaiting a reply", key: "guests" },
    { title: "Confirmed people", icon: "people", value: "120", detail: "Across 35 sample attending households", key: "guests" },
    { title: "Tasks completed", icon: "checklist", value: "24 / 40", detail: "Illustrative checklist progress", key: "tasks" },
    { title: "Recorded expenses", icon: "wallet", value: "₹2,45,000", detail: "Illustrative spending, not your records", key: "expenses" },
  ] as const;
  return (
    <>
      <div className="workspace-overview-heading">
        <div>
          <span className="wedding-kicker">{sample ? "Illustrative workspace" : "Overview & planning"}</span>
          <h1>Your wedding, coming together.</h1>
          <p>{sample ? "A glimpse of how the workspace will grow." : `A shared planning space for ${summary.couple}.`}</p>
        </div>
        {countdown}
      </div>
      {!sample && summary.archived && <p className="wedding-notice">This wedding is archived and read-only.</p>}
      <section className="workspace-metrics" aria-label={sample ? "Sample planning figures" : "Upcoming planning features"}>
        {metrics.map((metric) => (
          <article className="workspace-metric" key={metric.title}>
            <div><span>{metric.title}</span><WeddingIcon name={metric.icon} /></div>
            <strong className={sample ? "" : "workspace-metric-soon"}>{sample ? metric.value : "Coming soon"}</strong>
            <p>{sample ? metric.detail : "Available when this planning feature is built."}</p>
            {sample ? <small>Sample data</small> : <Link href={`/wedding/plan/${metric.key}`}>See what’s planned <span aria-hidden="true">→</span></Link>}
          </article>
        ))}
      </section>
      {!sample && <section className="workspace-quick-links" aria-label="Available actions">
        <strong><WeddingIcon name="spark" /> Your workspace</strong>
        <div>
          <Link href="/wedding/details" className="button button-secondary"><WeddingIcon name={summary.role === "ADMIN" && !summary.archived ? "edit" : "heart"} />{summary.role === "ADMIN" && !summary.archived ? "Edit wedding details" : "View wedding details"}</Link>
          <Link href="/wedding/family" className="button button-secondary"><WeddingIcon name="people" />Family &amp; access</Link>
          <Link href="/wedding/sample" className="workspace-text-link">Explore sample workspace <span aria-hidden="true">→</span></Link>
        </div>
      </section>}
      <div className="workspace-dashboard-columns">
        <div className="workspace-column">
          <section className="workspace-panel workspace-celebration">
            <div className="workspace-panel-heading"><h2><WeddingIcon name="heart" />Your celebration</h2><span>{sample ? "Sample" : "Saved details"}</span></div>
            <h3>{summary.title}</h3>
            <p>{summary.couple}</p>
            <dl className="workspace-facts">
              <div><dt>Wedding date</dt><dd>{summary.date}</dd></div>
              <div><dt>Time zone</dt><dd>{summary.timezone}</dd></div>
              <div><dt>Currency</dt><dd>{summary.currency}</dd></div>
              <div><dt>Overall budget</dt><dd>{summary.budget}</dd></div>
            </dl>
          </section>
          <section className="workspace-panel">
            <div className="workspace-panel-heading"><h2>Celebration timeline</h2>{sample ? <span>Sample events</span> : <Link className="workspace-text-link" href="/wedding/events">View events →</Link>}</div>
            {sample ? <ol className="workspace-timeline">
              {[
                ["13 FEB · 10:00 AM", "Haldi ceremony", "Courtyard Garden · Yellow festive attire"],
                ["13 FEB · 7:00 PM", "Sangeet evening", "Garden Pavilion · Festive attire"],
                ["14 FEB · 10:30 AM", "Wedding ceremony", "Main Pavilion · Traditional attire"],
              ].map(([date, name, venue]) => <li key={name}><small>{date}</small><h3>{name}</h3><p>{venue}</p></li>)}
            </ol> : events.length ? <ol className="workspace-timeline">{events.map((event) => <li key={event.id}><small>{eventDate(event.startsAt, summary.timezone)} · {eventTime(event.startsAt, summary.timezone)}</small><h3><Link href={`/wedding/events/${event.id}`}>{event.name}</Link></h3><p>{event.venue.name} · {event.status}</p></li>)}</ol> : <div className="workspace-empty"><span><WeddingIcon name="calendar" /></span><h3>{eventsUnavailable ? "Events are temporarily unavailable" : "A place for every celebration"}</h3><p>{eventsUnavailable ? "Your saved wedding details are still available. Try opening the event list again later." : "Add your first private event draft with its date, time and venue."}</p><Link href="/wedding/events">{eventsUnavailable ? "Open events" : summary.archived ? "View events" : "Plan your celebrations"} →</Link></div>}
          </section>
        </div>
        <div className="workspace-column">
          <section className="workspace-panel workspace-privacy">
            <div className="workspace-panel-heading"><h2><WeddingIcon name="shield" />Private by default</h2></div>
            <dl className="workspace-facts">
              <div><dt>Public website</dt><dd>{summary.website}</dd></div>
              <div><dt>Gallery</dt><dd>{summary.gallery}</dd></div>
            </dl>
            <p>Public information is published only by an explicit action. Names alone never grant access.</p>
          </section>
          <section className="workspace-panel">
            <div className="workspace-panel-heading"><h2>Assigned to you</h2><span>{sample ? "Sample tasks" : "Coming soon"}</span></div>
            {sample ? <ul className="workspace-sample-tasks">
              {["Review the catering menu", "Choose invitation artwork", "Confirm the ceremony playlist"].map((task) => <li key={task}><WeddingIcon name="checklist" /><div><strong>{task}</strong><small>Illustrative task · not assigned to your account</small></div></li>)}
            </ul> : <div className="workspace-empty workspace-empty-compact"><span><WeddingIcon name="checklist" /></span><h3>Small steps, shared together</h3><p>Your assigned tasks will have a home here when checklists are available.</p></div>}
          </section>
          <section className="workspace-panel">
            <div className="workspace-panel-heading"><h2>Planning together</h2><WeddingIcon name="people" /></div>
            <p>{sample ? "Sample family activity will eventually be replaced by actual saved updates." : "Your partner and family can help through explicit wedding invitations."}</p>
            {!sample && <Link className="workspace-text-link" href="/wedding/family">{summary.role === "ADMIN" ? "Manage family access" : "View planning family"} →</Link>}
          </section>
        </div>
      </div>
    </>
  );
}
