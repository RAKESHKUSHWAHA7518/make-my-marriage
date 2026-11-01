import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { publicationReview } from "@/modules/website/publication";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { PublicationAction } from "@/components/website/publication-action";
export const dynamic = "force-dynamic";
export const metadata = { title: "Unpublish website | Make My Marriage", robots: { index: false, follow: false } };
export default async function UnpublishPage() {
  const { user, wedding } = await eventWorkspace(), status = await publicationReview(user, wedding.id), disabled = !status.enabled || status.state !== "published" || (wedding.state !== "active" && wedding.role !== "ADMIN");
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="website"><main className="workspace-main website-page"><div className="website-unpublish"><span className="wedding-kicker">Website visibility</span><h1>Unpublish your website?</h1><p>New visitors will no longer be able to view your public website. Your saved draft and wedding planning details remain in your workspace.</p><section className="website-address"><strong>Public website</strong><code>/w/{status.slug}</code><span className="website-status">{status.state === "published" ? "Currently published" : "Already unpublished"}</span></section><PublicationAction action="unpublish" weddingId={wedding.id} payload={{ expectedPublishedRevision: status.publishedRevision }} disabled={disabled} />{disabled && <p className="wedding-notice">This action is unavailable for the current website status or your access.</p>}<Link href="/wedding/website/manage" className="button button-secondary">Back to website management</Link></div></main></WorkspaceShell>;
}
