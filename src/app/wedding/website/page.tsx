import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { websiteEditor } from "@/modules/website/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { WebsiteForm } from "@/components/website/website-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Wedding website | Make My Marriage", robots: { index: false, follow: false } };
export default async function WebsitePage() {
  const { user, wedding } = await eventWorkspace(), editor = await websiteEditor(user, wedding.id);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="website"><main className="workspace-main website-page"><header className="event-page-heading"><div><span className="wedding-kicker">Wedding website · Editor</span><h1>Your wedding website</h1><p>Choose what you’d like to share. Your changes stay private until you publish.</p></div><Link className="button button-secondary" href="/wedding/website/manage">Website management</Link></header><section className="website-address"><strong>Public address</strong><code>/w/{editor.slug}</code><p>{editor.state === "published" ? "Draft changes do not change the live website." : "The public address is not available to visitors yet."}</p></section><div className="website-editor-layout"><WebsiteForm editor={editor} weddingId={wedding.id} timezone={wedding.timezone} readOnly={wedding.state !== "active"} /><aside className="workspace-panel website-privacy"><h2>Private by default</h2><p>Your guest list, RSVP responses, expenses, vendor notes and gallery access stay private.</p><p>Saving this draft does not publish anything. The preview is available only to your planning family.</p><p>Use the separate review step when you are ready to publish.</p></aside></div></main></WorkspaceShell>;
}
