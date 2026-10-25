import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { householdFor } from "@/modules/households/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { RemoveGuestButton } from "@/components/guests/remove-guest-button";
import { eventDate, eventTime } from "@/modules/events/schema";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
export const dynamic = "force-dynamic";
export const metadata = { title: "Guest group details | Make My Marriage" };
export default async function GuestDetailsPage({ params, searchParams }: { params: Promise<{ householdId: string }>; searchParams: Promise<{ created?: string; updated?: string }> }) {
  const { user, wedding } = await eventWorkspace(), { householdId } = await params, flags = await searchParams;
  const group = await householdFor(user, wedding.id, householdId), editable = wedding.state === "active" && group?.status === "active";
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="guests"><main className="workspace-main guests-page"><Link className="wedding-back" href="/wedding/guests">← Back to guest groups</Link>
    {!group ? <section className="workspace-panel event-empty"><h1>Guest group unavailable</h1><p>This record is unavailable or you no longer have permission to view it.</p></section> : <>
      {(flags.created === "1" || flags.updated === "1") && <p className="wedding-notice wedding-success" role="status">Guest group {flags.created === "1" ? "created" : "updated"}.</p>}
      <section className="workspace-panel guest-detail-heading"><div><span className="guest-status">RSVP · {group.rsvp.status.replaceAll("_", " ")}</span><h1>{group.displayName}</h1><p>One invitation or family group.</p></div>{editable && <div className="event-form-actions"><RemoveGuestButton weddingId={wedding.id} id={group.id} name={group.displayName} version={group.version} /><Link className="button button-secondary" href={`/wedding/guests/${group.id}/edit`}><WeddingIcon name="edit" />Edit guest group</Link></div>}</section>
      {!editable && <p className="wedding-notice">{group.status === "removed" ? "This guest group was removed. Its history is preserved and it is excluded from active totals." : "This wedding is archived. Guest records are read-only."}</p>}
      <p className="wedding-notice">RSVP responses and invitation sharing will be available in a later increment. This private record does not send an invitation.</p>
      <div className="guest-detail-grid"><div><section className="workspace-panel"><h2>Party &amp; contact information</h2><dl className="workspace-facts"><div><dt>Representative</dt><dd>{group.representative.name}</dd></div><div><dt>Maximum party size</dt><dd>{group.maxGuests} {group.maxGuests === 1 ? "person" : "people"}, including the representative</dd></div><div><dt>Email address</dt><dd>{group.representative.email ?? "Email not provided"}</dd></div><div><dt>Phone number</dt><dd>{group.representative.phone ?? "Phone not provided"}</dd></div></dl></section><section className="workspace-panel guest-notes"><h2><WeddingIcon name="lock" />Private planning notes</h2><p>{group.notes || "No notes added"}</p><small>Visible only to your wedding’s planning family.</small></section></div><section className="workspace-panel"><h2>Invited celebrations</h2><div className="guest-detail-events">{group.events.map(e => <article key={e.id}><span className="guest-status">{e.available ? e.status : "Unavailable"}</span><h3>{e.name}</h3>{e.startsAt && <p>{eventDate(e.startsAt, wedding.timezone)} · {eventTime(e.startsAt, wedding.timezone)}</p>}{e.venue && <p>{e.venue}</p>}{e.available ? <Link href={`/wedding/events/${e.id}`}>View celebration →</Link> : <p>This association is retained in planning history.</p>}</article>)}</div></section></div>
    </>}
  </main></WorkspaceShell>;
}
