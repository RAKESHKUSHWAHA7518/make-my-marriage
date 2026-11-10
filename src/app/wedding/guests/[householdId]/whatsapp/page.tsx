import Link from "next/link";
import { notFound } from "next/navigation";
import { eventWorkspace } from "@/modules/events/page-session";
import { householdFor } from "@/modules/households/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { WhatsappSharing } from "@/components/invitation/whatsapp-sharing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Share invitation via WhatsApp | Make My Marriage" };

export default async function WhatsappPage({ params }: PageProps<"/wedding/guests/[householdId]/whatsapp">) {
  const { user, wedding } = await eventWorkspace();
  const { householdId } = await params;
  const group = await householdFor(user, wedding.id, householdId);
  if (!group || group.status !== "active") notFound();
  return (
    <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="guests">
      <main className="workspace-main designs-page">
        <Link className="wedding-back" href={`/wedding/guests/${householdId}`}>← Back to household</Link>
        <header className="event-page-heading"><div><h1>Share via WhatsApp</h1><p>{group.displayName}</p></div></header>
        {wedding.state === "active" ? <WhatsappSharing weddingId={wedding.id} householdId={householdId} />
          : <p className="wedding-notice">Sharing is unavailable for archived weddings.</p>}
      </main>
    </WorkspaceShell>
  );
}
