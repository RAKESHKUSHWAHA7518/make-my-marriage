import Link from "next/link";
import { notFound } from "next/navigation";
import { eventWorkspace } from "@/modules/events/page-session";
import { announcementFor } from "@/modules/announcements/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Edit announcement | Make My Marriage" };
export default async function EditAnnouncement({ params }: { params: Promise<{ announcementId: string }> }) {
  const { user, wedding } = await eventWorkspace(), { announcementId } = await params, item = await announcementFor(user, wedding.id, announcementId); if (!item) notFound();
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="announcements"><main className="workspace-main announcement-page"><Link href={`/wedding/announcements/${item.id}`} className="button button-secondary">← Back to announcement</Link><header className="event-page-heading"><div><span className="wedding-kicker">Your planning family</span><h1>Edit announcement</h1><p>Keep your planning family up to date.</p></div></header>{wedding.state === "active" ? <AnnouncementForm weddingId={wedding.id} initial={item} /> : <p className="wedding-notice">This wedding is archived. Announcements are read-only.</p>}</main></WorkspaceShell>;
}
