import Link from "next/link";
import { guestPageSite } from "@/modules/guest-access/page-session";
import { GuestUnavailable } from "@/components/invitation/guest-unavailable";
import { GuestEvents } from "@/components/invitation/guest-events";
import { eventDate, eventTime } from "@/modules/events/schema";
export const dynamic="force-dynamic";
export default async function GuestInvitationPage(){const site=await guestPageSite();if(!site)return <GuestUnavailable/>;
return <><section className="invitation-panel invitation-welcome"><span className="wedding-kicker">Private wedding invitation</span><h1>{site.couple.brideName} &amp; {site.couple.groomName}</h1><h2>Welcome, {site.household.representativeName}</h2>{site.household.name!==site.household.representativeName && <p>{site.household.name}</p>}<p>Your invitation allows up to {site.rsvp.maxGuests} people, including you.</p>{site.archived && <p className="wedding-notice">This wedding is archived. Responses are read-only.</p>}{site.events.length ? <><p>One response applies to all events shown in your invitation.</p><Link className="button button-primary" href={site.rsvp.status==="pending" && site.rsvp.editable ? "/guest/rsvp" : "/guest/response"}>{site.rsvp.status==="pending" && site.rsvp.editable ? "Respond to invitation" : "View your response"}</Link></> : <><h2>Your invitation details aren’t available yet</h2><p>Please check with the family who shared this link.</p></>}{site.rsvp.deadline && <p>Requested response date: {eventDate(site.rsvp.deadline,site.timezone)} · {eventTime(site.rsvp.deadline,site.timezone)} ({site.timezone})</p>}</section>{!!site.events.length && <GuestEvents site={site}/>}</>;
}
