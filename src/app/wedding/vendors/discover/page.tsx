import { eventWorkspace } from "@/modules/events/page-session";
import { placesConfiguration } from "@/infrastructure/google-places/client";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { VendorDiscovery } from "@/components/vendors/vendor-discovery";
import { googleVendorsEnabled, vendorEventChoices } from "@/modules/vendors/service";
export const dynamic = "force-dynamic";
export const metadata = { title: "Find vendors | Make My Marriage" };
export default async function DiscoveryPage() {
  const { user, wedding } = await eventWorkspace();
  const [events, canSave] = await Promise.all([vendorEventChoices(user, wedding.id), googleVendorsEnabled()]);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="vendors"><main className="workspace-main vendors-page"><VendorDiscovery key={wedding.id} weddingId={wedding.id} events={events} canSave={canSave} archived={wedding.state !== "active"} {...placesConfiguration()} /></main></WorkspaceShell>;
}
