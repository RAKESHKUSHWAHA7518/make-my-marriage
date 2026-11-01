import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { vendorEventChoices, vendorsReady } from "@/modules/vendors/service";
import { VendorForm } from "@/components/vendors/vendor-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Add vendor | Make My Marriage" };
export default async function AddVendorPage() {
  const { user, wedding } = await eventWorkspace(); await vendorsReady(); const events = await vendorEventChoices(user, wedding.id);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="vendors"><main className="workspace-main vendors-page"><Link className="wedding-back" href="/wedding/vendors">← Back to vendors</Link><header className="event-page-heading"><div><span className="wedding-kicker">Manual vendor entry</span><h1>Add vendor</h1><p>Save a contact for your wedding planning.</p></div></header>{wedding.state !== "active" ? <p className="wedding-notice">This wedding is archived. Vendor records are read-only.</p> : <div className="planning-vendor-editor-layout"><VendorForm weddingId={wedding.id} events={events} /><aside className="planning-vendor-advice"><h2>A place for every contact</h2><p>Add known businesses, family recommendations or informal contacts.</p><p>Only your wedding’s planning family can see these details.</p><p>Saving a contact does not make a booking or send a message.</p></aside></div>}</main></WorkspaceShell>;
}
