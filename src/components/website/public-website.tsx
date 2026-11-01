import type { ReactNode } from "react";
import type { PublicWebsite } from "@/modules/website/publication";
import { eventDate } from "@/modules/events/schema";
export function WeddingCelebration({ content, cover, privatePreview = false }: { content: PublicWebsite; cover?: ReactNode; privatePreview?: boolean }) {
  const time = (v: string) => new Intl.DateTimeFormat("en-IN", { timeZone: content.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(v));
  return <article className="website-preview website-celebration"><header className="website-preview-hero"><span className="wedding-kicker">The wedding celebration of</span><h1>{content.coupleNames}</h1>{content.date && <p>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(content.date + "T12:00:00Z"))}</p>}</header>
    {cover}
    {content.intro && <section className="website-preview-welcome" id="welcome"><span className="wedding-kicker">With love and gratitude</span><h2>A celebration to remember</h2><p>{content.intro}</p></section>}
    {!!content.events.length && <section className="website-preview-events" id="celebrations"><span className="wedding-kicker">The schedule of celebrations</span><h2>The wedding itinerary</h2><p className="website-helper">All event times use {content.timezone}.</p><div className="website-event-grid">{content.events.map((e, i) => <section className="website-preview-event" key={i}><p className="website-event-time">{eventDate(e.startsAt, content.timezone)}<br />{time(e.startsAt)}{e.endsAt && ` – ${time(e.endsAt)}`}</p><h3>{e.name}</h3>{e.description && <p>{e.description}</p>}<div className="website-event-venue"><p><strong>{e.venue.name}</strong><br />{e.venue.address}</p>{e.dressCode && <p>Dress guidance: {e.dressCode}</p>}</div></section>)}</div></section>}
    {content.contact && <section className="website-preview-contact" id="contact"><span className="wedding-kicker">Stay in touch</span><h2>Wedding inquiries</h2>{content.contact.name && <p>{content.contact.name}</p>}<div className="website-actions">{content.contact.email && <a className="button button-secondary" href={`mailto:${content.contact.email}`}>{content.contact.email}</a>}{content.contact.phone && <a className="button button-secondary" href={`tel:${content.contact.phone.replace(/[^+\d]/g, "")}`}>{content.contact.phone}</a>}</div></section>}
    <footer><strong>{content.coupleNames}</strong><p>Make My Marriage{privatePreview ? " · Private family preview" : ""}</p></footer>
  </article>;
}
