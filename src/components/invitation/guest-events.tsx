import { eventDate, eventTime } from "@/modules/events/schema";
import type { GuestSite } from "@/modules/guest-access/service";
export function GuestEvents({ site }: { site: GuestSite }) {
  return <section className="invitation-events"><h2>Your invited celebrations</h2>{site.events.map((event) => <article className="invitation-panel" key={event.id}><h3>{event.name}</h3><dl><div><dt>When</dt><dd>{eventDate(event.startsAt, site.timezone)} · {eventTime(event.startsAt, site.timezone)}{event.endsAt && <> — {eventDate(event.endsAt, site.timezone)} · {eventTime(event.endsAt, site.timezone)}</>}<small>{site.timezone}</small></dd></div><div><dt>Venue</dt><dd>{event.venue.name}<br />{event.venue.address}</dd></div>{event.dressCode && <div><dt>Dress code</dt><dd>{event.dressCode}</dd></div>}</dl>{event.description && <p>{event.description}</p>}{event.venue.mapUrl && <a href={event.venue.mapUrl} target="_blank" rel="noopener noreferrer">Open venue map ↗</a>}</article>)}</section>;
}
