import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { announcementsReady } from "@/modules/announcements/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "New announcement | Make My Marriage" };
export default async function NewAnnouncement() {
  const { user, wedding } = await eventWorkspace(); await announcementsReady();
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="announcements"><main className="workspace-main announcement-page"><Link className="button button-secondary" href="/wedding/announcements">← Back to announcements</Link><header className="event-page-heading"><div><span className="wedding-kicker">Your planning family</span><h1>New announcement</h1><p>Share a note, reminder or schedule change with your planning family.</p></div></header>{wedding.state === "active" ? <AnnouncementForm weddingId={wedding.id} /> : <p className="wedding-notice">This wedding is archived. Announcements are read-only.</p>}</main></WorkspaceShell>;
}
