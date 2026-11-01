import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { websitePreview } from "@/modules/website/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { WebsitePreviewContent } from "@/components/website/website-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Private website preview | Make My Marriage", robots: { index: false, follow: false } };
export default async function PreviewPage() {
  const { user, wedding } = await eventWorkspace(), preview = await websitePreview(user, wedding.id);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="website"><main className="workspace-main website-page"><header className="website-preview-banner"><div><strong>Private preview</strong><p>Only your wedding’s planning family can see this preview.</p></div><div className="website-actions"><Link className="button button-secondary" href="/wedding/website">← Back to editor</Link>{wedding.state === "active" && <Link className="button button-primary" href="/wedding/website/review">Review before publishing</Link>}</div></header>{preview.selectionChanged && <p className="wedding-notice">Some selected events or the cover photo are no longer available and have been omitted. Review your draft before continuing.</p>}<WebsitePreviewContent preview={preview} /></main></WorkspaceShell>;
}
