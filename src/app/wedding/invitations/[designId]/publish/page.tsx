import Link from "next/link";
import { notFound } from "next/navigation";
import { eventWorkspace } from "@/modules/events/page-session";
import { designFor } from "@/modules/designs/service";
import { publicationEnabled, publicationReview } from "@/modules/designs/publication";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { DesignCard } from "@/components/designs/design-card";
import { PublicationAction } from "@/components/designs/publication-actions";
export const dynamic = "force-dynamic";
export const metadata = { title: "Publish invitation review | Make My Marriage" };
export default async function PublishInvitationPage({ params }: { params: Promise<{ designId: string }> }) {
  const { user, wedding } = await eventWorkspace(), { designId } = await params, draft = await designFor(user, wedding.id, designId);
  if (!draft) notFound();
  const enabled = await publicationEnabled(), review = enabled ? await publicationReview(user, wedding.id, designId) : null;
  const content = review?.content ?? draft, events = review?.events ?? draft.events;
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="invitations"><main className="workspace-main designs-page"><Link className="wedding-back" href={`/wedding/invitations/${designId}`}>← Back to draft</Link><header className="event-page-heading"><div><h1>Publish invitation review</h1><p>{content.name}</p></div></header><div className="design-editor-grid"><div><section className="workspace-panel"><h2>A fixed version of your card</h2><p>Publishing creates a fixed version. Later draft edits will not change it.</p><p className="design-privacy">Publishing does not send invitations or publish your wedding website. Choose a published version for each household separately.</p><h2>Represented events</h2>{events.length ? <ul className="publication-events">{events.map(e => <li key={e.id}>{e.name}{!e.available ? " · Unavailable" : e.changed ? " · Changed since draft save" : ""}</li>)}</ul> : <p>Wedding-wide wording · No event-specific details.</p>}{events.some(e => e.changed) && <p className="wedding-notice">Event details changed since this draft was saved. Review the wording manually; it has not been rewritten.</p>}{!enabled && <p className="wedding-notice">Publishing is awaiting activation. Your draft remains saved.</p>}{review && !review.available && <p className="wedding-notice">Publishing is blocked because an image or represented event is unavailable.</p>}{wedding.state !== "active" && <p className="wedding-notice">This wedding is archived. Publishing is disabled.</p>}{review && <PublicationAction url={`/api/v1/weddings/${wedding.id}/designs/${designId}/publish`} payload={{ expectedVersion: review.expectedVersion, expectedPublishedVersionId: review.expectedPublishedVersionId, expectedReviewHash: review.expectedReviewHash }} destination={`/wedding/invitations/${designId}/versions/{version}?published=1`} label="Publish version" disabled={wedding.state !== "active" || !review.available} confirmation="I confirm that the invitation wording and represented events are correct." />}</section></div><section className="design-preview-panel"><h2>Saved card preview</h2><DesignCard mode={content.mode} draft={content.draft} imageAvailable={draft.imageAvailable} /></section></div></main></WorkspaceShell>;
}
