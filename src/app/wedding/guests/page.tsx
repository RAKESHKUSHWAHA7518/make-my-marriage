import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { listHouseholds, guestEventChoices, guestTotals, rsvpTotals } from "@/modules/households/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { RsvpSummary } from "@/components/invitation/rsvp-summary";
import { GuestCounts, GuestRows } from "@/components/guests/guest-display";
import { GuestFilters } from "@/components/guests/guest-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guest groups | Make My Marriage" };
export default async function GuestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, wedding } = await eventWorkspace(), raw = await searchParams;
  const query = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1] && entry[0] !== "removed"));
  const [page, choices, totals, responses] = await Promise.all([listHouseholds(user, wedding.id, query), guestEventChoices(user, wedding.id), guestTotals(user, wedding.id), rsvpTotals(user, wedding.id)]);
  const next = new URLSearchParams(query); if (page.pagination.nextCursor) next.set("cursor", page.pagination.nextCursor);
  const filtered = Object.keys(query).some(k => !["cursor", "limit"].includes(k));
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="guests"><main className="workspace-main guests-page">
    <header className="event-page-heading"><div><span className="wedding-kicker">Your invitation groups</span><h1>Guest groups</h1><p>Organise who is invited to each of your celebrations.</p></div>{wedding.state === "active" && <Link href="/wedding/guests/new" className="button button-primary">+ Add guest group</Link>}</header>
    {raw.removed === "1" && <p className="wedding-notice wedding-success" role="status">Guest group removed from active lists and totals.</p>}
    {wedding.state !== "active" && <p className="wedding-notice">This wedding is archived. Guest records are read-only.</p>}
    <GuestCounts totals={totals} /><RsvpSummary totals={responses} /><GuestFilters key={JSON.stringify(query)} query={query} choices={choices} />
    {page.data.length ? <><p className="guest-result-count">Showing {page.data.length} of {page.pagination.total} matching groups{query.cursor ? " on this page" : ""}</p><GuestRows groups={page.data} timezone={wedding.timezone} /></> : <section className="workspace-panel event-empty"><h2>{filtered ? "No guest groups match your search" : query.cursor ? "No guest groups on this page" : "Start organising your guest groups"}</h2><p>{filtered ? "Adjust your search or choose another celebration." : "One group can represent a family, couple or individual invitation."}</p>{filtered || query.cursor ? <Link className="button button-secondary" href="/wedding/guests">Clear search and filters</Link> : wedding.state === "active" && <Link className="button button-primary" href="/wedding/guests/new">+ Add guest group</Link>}</section>}
    <nav className="guest-pagination" aria-label="Guest list pages">{query.cursor && <Link className="button button-secondary" href={`/wedding/guests?${new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([k]) => k !== "cursor")))}`}>Back to first page</Link>}{page.pagination.nextCursor && <Link className="button button-secondary" href={`/wedding/guests?${next}`}>Next page →</Link>}</nav>
    <p className="guest-helper">One record is one invitation or family group. Copy a private invitation link from guest details. One response applies across each household’s invited eligible celebrations.</p>
  </main></WorkspaceShell>;
}
