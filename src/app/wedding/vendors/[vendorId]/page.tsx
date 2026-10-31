import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { vendorFor } from "@/modules/vendors/service";
import { vendorCategoryLabels } from "@/modules/vendors/schema";
import { eventDate } from "@/modules/events/schema";
import { RemoveVendor } from "@/components/vendors/remove-vendor";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
import { SavedPlaceDetails } from "@/components/vendors/saved-place-details";
import { placesConfiguration } from "@/infrastructure/google-places/client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Vendor details | Make My Marriage" };
export default async function VendorPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { user, wedding } = await eventWorkspace(), vendor = await vendorFor(user, wedding.id, (await params).vendorId);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="vendors"><main className="workspace-main vendors-page"><Link className="wedding-back" href="/wedding/vendors">← Back to vendors</Link>{!vendor ? <section className="workspace-panel event-empty"><h1>This vendor is no longer available.</h1><Link className="button button-secondary" href="/wedding/vendors">Back to vendors</Link></section> : <>
    {wedding.state !== "active" && <p className="wedding-notice">This wedding is archived. Vendor records are read-only.</p>}{vendor.status === "removed" && <p className="wedding-notice">This vendor has been removed from your active planning list. Saved history remains available.</p>}
    <section className="workspace-panel planning-vendor-detail-heading"><div><div className="planning-vendor-detail-badges"><span className="planning-vendor-category">{vendorCategoryLabels[vendor.category as keyof typeof vendorCategoryLabels] ?? vendor.category}</span><span className="planning-vendor-source">{vendor.source === "GOOGLE_PLACES" ? "Google Places" : "Manual"}</span></div><h1>{vendor.name}</h1><p>{vendor.source === "GOOGLE_PLACES" ? "Private planning label and saved Google place reference." : `A saved contact for ${wedding.title}.`}</p></div>{wedding.state === "active" && vendor.status === "active" && <div className="planning-vendor-form-actions"><Link className="button button-secondary" href={`/wedding/vendors/${vendor.id}/edit`}>Edit vendor</Link><RemoveVendor weddingId={wedding.id} vendor={vendor} /></div>}</section>
    <div className="planning-vendor-detail-layout"><div>
      {vendor.source === "GOOGLE_PLACES" && vendor.googlePlaceId && <SavedPlaceDetails key={`${wedding.id}:${vendor.googlePlaceId}`} weddingId={wedding.id} placeId={vendor.googlePlaceId} archived={wedding.state !== "active"} {...placesConfiguration()} />}
      <section className="workspace-panel planning-vendor-detail-section"><h2><WeddingIcon name="people" />Contact information</h2>{vendor.contact && Object.values(vendor.contact).some(Boolean) ? <dl className="planning-vendor-contact-grid">{vendor.contact.person && <div><dt>Contact person</dt><dd>{vendor.contact.person}</dd></div>}{vendor.contact.phone && <div><dt>Phone number</dt><dd><a href={`tel:${vendor.contact.phone.replace(/[^+\d]/g, "")}`}>{vendor.contact.phone}</a></dd></div>}{vendor.contact.email && <div><dt>Email address</dt><dd><a href={`mailto:${vendor.contact.email}`}>{vendor.contact.email}</a></dd></div>}{vendor.contact.address && <div><dt>Address</dt><dd>{vendor.contact.address}</dd></div>}</dl> : <p className="planning-vendor-helper">No contact details added yet.</p>}</section>
      <section className="workspace-panel planning-vendor-detail-section"><h2><WeddingIcon name="calendar" />Related events</h2><div className="planning-vendor-event-tags">{vendor.events.length ? vendor.events.map(e => <span key={e.id}>{e.name}{e.available ? "" : " · Unavailable"}</span>) : <span>Wedding-wide</span>}</div></section>
      {vendor.notes && <section className="workspace-panel planning-vendor-detail-section"><h2><WeddingIcon name="lock" />Private planning notes</h2><p className="planning-vendor-notes">{vendor.notes}</p></section>}
    </div><aside className="planning-vendor-advice"><h2>Private to your planning family</h2><p>This is an internal planning contact. Saving it does not contact, book or pay the business.</p><dl><dt>Added</dt><dd>{eventDate(vendor.createdAt, wedding.timezone)}</dd><dt>Last updated</dt><dd>{eventDate(vendor.updatedAt, wedding.timezone)}</dd></dl></aside></div>
  </>}</main></WorkspaceShell>;
}
