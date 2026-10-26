import Link from "next/link";
import { guestPageSite } from "@/modules/guest-access/page-session";
import { GuestUnavailable } from "@/components/invitation/guest-unavailable";
import { GuestEvents } from "@/components/invitation/guest-events";
import { eventDate, eventTime } from "@/modules/events/schema";
import { responseLabels } from "@/modules/guest-access/schema";
export const dynamic="force-dynamic";
export default async function SavedResponsePage(){const site=await guestPageSite();if(!site)return <GuestUnavailable/>;return <><section className="invitation-panel invitation-receipt"><h1>{site.rsvp.status==="pending" ? "No response saved yet" : "Your response has been saved"}</h1><h2>{site.household.name}</h2><p><strong>{responseLabels[site.rsvp.status]}{site.rsvp.status==="attending" ? " · "+site.rsvp.attendeeCount+" people" : ""}</strong></p>{site.rsvp.respondedAt && <p>Last response: {eventDate(site.rsvp.respondedAt,site.timezone)} · {eventTime(site.rsvp.respondedAt,site.timezone)}</p>}{site.archived && <p className="wedding-notice">This wedding is archived. Responses are read-only.</p>}<div className="event-form-actions">{site.rsvp.editable && <Link href="/guest/rsvp" className="button button-primary">{site.rsvp.status==="pending" ? "Respond to invitation" : "Edit response"}</Link>}<Link href="/guest" className="button button-secondary">Back to invitation</Link></div></section>{!!site.events.length && <GuestEvents site={site}/>}</>;}
