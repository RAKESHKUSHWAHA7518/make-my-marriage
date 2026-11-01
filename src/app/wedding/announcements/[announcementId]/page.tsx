import Link from "next/link";
import { notFound } from "next/navigation";
import { eventWorkspace } from "@/modules/events/page-session";
import { announcementFor } from "@/modules/announcements/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { AnnouncementCard } from "@/components/announcements/announcement-display";
export const dynamic = "force-dynamic";
export const metadata = { title: "Family announcement | Make My Marriage" };
export default async function AnnouncementPage({ params }: { params: Promise<{ announcementId: string }> }) {
  const { user, wedding } = await eventWorkspace(), { announcementId } = await params, item = await announcementFor(user, wedding.id, announcementId); if (!item) notFound();
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="announcements"><main className="workspace-main announcement-page"><Link href="/wedding/announcements" className="button button-secondary">← All announcements</Link><header className="event-page-heading"><div><span className="wedding-kicker">Private family update</span><h1>Family announcement</h1></div></header>{wedding.state !== "active" && <p className="wedding-notice">This wedding is archived. Announcements are read-only.</p>}<AnnouncementCard key={`${item.id}:${item.version}`} item={item} weddingId={wedding.id} timezone={wedding.timezone} readOnly={wedding.state !== "active"} /></main></WorkspaceShell>;
}
