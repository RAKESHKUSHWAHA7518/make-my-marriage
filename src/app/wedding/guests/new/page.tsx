import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { guestEventChoices, householdsReady } from "@/modules/households/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { GuestForm } from "@/components/guests/guest-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Add guest group | Make My Marriage" };
export default async function NewGuestPage() {
  const { user, wedding } = await eventWorkspace(); await householdsReady();
  const choices = wedding.state === "active" ? await guestEventChoices(user, wedding.id) : [];
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="guests"><main className="workspace-main guests-page"><Link href="/wedding/guests" className="wedding-back">← Back to guest groups</Link><header className="event-page-heading"><div><h1>Add guest group</h1><p>Create a private record for a family, couple or individual invitation.</p></div></header>{wedding.state === "active" ? <GuestForm weddingId={wedding.id} timezone={wedding.timezone} choices={choices} /> : <p className="wedding-notice">This wedding is archived. Guest groups cannot be added.</p>}</main></WorkspaceShell>;
}
