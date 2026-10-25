import Link from "next/link";
import type { EventView } from "@/modules/events/service";
import { eventDate, eventTime, eventTypeLabels } from "@/modules/events/schema";
import { WeddingIcon } from "./wedding-icon";

export function EventCard({ event, timezone }: { event: EventView; timezone: string }) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, month: "short", day: "2-digit", year: "numeric" }).formatToParts(new Date(event.startsAt));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return <article className="event-card">
    <div className="event-calendar" aria-hidden="true"><span>{part("month")}</span><strong>{part("day")}</strong><small>{part("year")}</small></div>
    <div className="event-card-copy">
      <div className="event-badges"><span>{eventTypeLabels[event.type]}</span><span className="event-status">{event.status}</span></div>
      <h2>{event.name}</h2>
      <p><WeddingIcon name="calendar" /><span>{eventDate(event.startsAt, timezone)}, {eventTime(event.startsAt, timezone)}{event.endsAt ? ` – ${eventDate(event.endsAt, timezone)}, ${eventTime(event.endsAt, timezone)}` : " · End time not decided"}</span></p>
      <p><WeddingIcon name="pin" /><span>{event.venue.name} · {event.venue.address}</span></p>
      <small>{timezone}</small>
    </div>
    <Link className="button button-secondary" href={`/wedding/events/${event.id}`}>View details <WeddingIcon name="arrow" /></Link>
  </article>;
}
