import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { vendorEventChoices, vendorFor } from "@/modules/vendors/service";
import { VendorForm } from "@/components/vendors/vendor-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Edit vendor | Make My Marriage" };
export default async function EditVendorPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { user, wedding } = await eventWorkspace(), vendor = await vendorFor(user, wedding.id, (await params).vendorId), events = await vendorEventChoices(user, wedding.id);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="vendors"><main className="workspace-main vendors-page"><Link className="wedding-back" href="/wedding/vendors">← Back to vendors</Link><header className="event-page-heading"><div><h1>Edit vendor</h1><p>Keep your contact and coordination details up to date.</p></div></header>{!vendor || vendor.status === "removed" ? <p className="wedding-notice">This vendor is no longer available for editing.</p> : wedding.state !== "active" ? <p className="wedding-notice">This wedding is archived. Vendor records are read-only.</p> : <VendorForm key={`${vendor.id}:${vendor.version}`} weddingId={wedding.id} events={events} initial={vendor} />}</main></WorkspaceShell>;
}
