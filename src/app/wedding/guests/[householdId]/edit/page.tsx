import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { householdFor, guestEventChoices } from "@/modules/households/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { GuestForm } from "@/components/guests/guest-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Edit guest group | Make My Marriage" };
export default async function EditGuestPage({ params }: { params: Promise<{ householdId: string }> }) {
  const { user, wedding } = await eventWorkspace(), { householdId } = await params;
  const group = await householdFor(user, wedding.id, householdId), editable = group?.status === "active" && wedding.state === "active";
  const choices = editable ? await guestEventChoices(user, wedding.id) : [];
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="guests"><main className="workspace-main guests-page"><Link href={group ? `/wedding/guests/${group.id}` : "/wedding/guests"} className="wedding-back">← Back to {group ? "guest group details" : "guest groups"}</Link><header className="event-page-heading"><div><h1>Edit guest group</h1><p>Update party details, contacts and invited celebrations.</p></div></header>{editable && group ? <GuestForm key={`${group.id}-${group.version}`} weddingId={wedding.id} timezone={wedding.timezone} initial={group} choices={choices} /> : <p className="wedding-notice">{!group ? "Guest group unavailable." : group.status === "removed" ? "This guest group was removed. Its history is read-only." : "This wedding is archived. Guest records are read-only."}</p>}</main></WorkspaceShell>;
}
