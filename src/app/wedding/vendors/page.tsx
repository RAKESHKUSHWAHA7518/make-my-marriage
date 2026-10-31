import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { listVendors, vendorEventChoices } from "@/modules/vendors/service";
import { vendorQuerySchema } from "@/modules/vendors/schema";
import { VendorFilters, VendorRows } from "@/components/vendors/vendor-list";
export const dynamic = "force-dynamic";
export const metadata = { title: "Vendors | Make My Marriage" };
export default async function VendorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, wedding } = await eventWorkspace(), raw = await searchParams;
  const query = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  const valid = vendorQuerySchema.safeParse(query);
  if (!valid.success || Object.values(raw).some(v => Array.isArray(v))) return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="vendors"><main className="workspace-main"><h1>Check your vendor filters</h1><p>Use a valid category, event and search.</p><Link className="button button-primary" href="/wedding/vendors">Clear filters</Link></main></WorkspaceShell>;
  const [page, events] = await Promise.all([listVendors(user, wedding.id, query), vendorEventChoices(user, wedding.id)]);
  const next = new URLSearchParams(query); if (page.pagination.nextCursor) next.set("cursor", page.pagination.nextCursor);
  const filtered = !!(valid.data.q || valid.data.category || valid.data.eventId || valid.data.source || valid.data.status === "removed");
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="vendors"><main className="workspace-main vendors-page">
    <header className="event-page-heading"><div><span className="wedding-kicker">Your planning contacts</span><h1>Vendors</h1><p>Keep your wedding contacts and coordination notes together.</p></div>{wedding.state === "active" && <div className="planning-vendor-form-actions"><Link className="button button-secondary" href="/wedding/vendors/discover">Find vendors with Google Places</Link><Link className="button button-primary" href="/wedding/vendors/new">+ Add vendor</Link></div>}</header>
    {wedding.state !== "active" && <p className="wedding-notice">This wedding is archived. Vendor records are read-only.</p>}
    <VendorFilters query={query} events={events} />
    {page.data.length ? <><VendorRows vendors={page.data} /><p className="planning-vendor-helper">Showing {page.data.length} on this page · {page.pagination.total} matching {page.pagination.total === 1 ? "vendor" : "vendors"}.</p></> : <section className="workspace-panel event-empty"><h2>{filtered ? "No matching vendors" : "Your vendor contacts, all together."}</h2><p>{filtered ? "Try adjusting your search or filters." : "Save your first vendor contact to keep the details close."}</p>{filtered ? <Link className="button button-secondary" href="/wedding/vendors">Clear filters</Link> : wedding.state === "active" && <Link className="button button-primary" href="/wedding/vendors/new">Add vendor</Link>}</section>}
    <div className="planning-vendor-pagination">{page.pagination.nextCursor && <Link className="button button-secondary" href={"/wedding/vendors?" + next}>Next page →</Link>}{query.cursor && <Link className="button button-secondary" href={"/wedding/vendors?" + new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([k]) => k !== "cursor")))}>First page</Link>}</div>
    <p className="planning-vendor-planning-note">Saving a vendor keeps contacts and coordination notes in one place. It does not book, contact or pay that business.</p>
  </main></WorkspaceShell>;
}
