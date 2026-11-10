import Link from "next/link";
import { notFound } from "next/navigation";
import { eventWorkspace } from "@/modules/events/page-session";
import { AccountError } from "@/modules/identity/security";
import { invitationEmailHistory, reviewInvitationEmail } from "@/modules/invitation-email/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { PublicationAction } from "@/components/designs/publication-actions";
import { InvitationEmailPreview } from "@/components/invitation/invitation-email-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review invitation email | Make My Marriage" };

export default async function InvitationEmailPage({ params }: { params: Promise<{ householdId: string }> }) {
  const { user, wedding } = await eventWorkspace();
  const { householdId } = await params;
  const back = `/wedding/guests/${householdId}`;
  const history = await invitationEmailHistory(user, wedding.id, householdId);
  const review = await reviewInvitationEmail(user, wedding.id, householdId).catch(error => {
    if (error instanceof AccountError && error.status === 404) return null;
    throw error;
  });
  if (!review && !history.length) notFound();
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: wedding.timezone });

  return (
    <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="guests">
      <main className="workspace-main designs-page">
        <Link className="wedding-back" href={back}>← Back to household</Link>
        <header className="event-page-heading"><div><h1>{review ? "Review invitation email" : "Invitation email history"}</h1><p>{review?.snapshot.household}</p></div></header>
        {review && (
          <div className="design-editor-grid">
            <section className="workspace-panel">
              <h2>Recipient and invitation details</h2>
              <dl className="workspace-facts">
                <div><dt>Representative</dt><dd>{review.snapshot.recipient}</dd></div>
                <div><dt>Saved email address</dt><dd>{review.snapshot.address || "Email not provided"}</dd></div>
                <div><dt>Published card</dt><dd>{review.snapshot.card ? `${review.snapshot.card.name} · Version ${review.snapshot.card.revision}` : "No card selected"}</dd></div>
              </dl>
              {wedding.state === "active" && <div className="design-actions">
                <Link className="button button-secondary" href={`${back}/edit`}>Edit guest details</Link>
                <Link className="button button-secondary" href={`${back}/card`}>Change card selection</Link>
              </div>}
              <h2>Invited events</h2>
              <ul className="publication-events">{review.snapshot.events.map((event, index) => <li key={index}>{event.name} · {event.time} · {event.venue}</li>)}</ul>
              <p>The email opens the household’s private invitation. Guests can respond without an account or code.</p>
              {review.issues.length > 0 && <ul className="wedding-notice publication-events">{review.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
              {wedding.state === "active" && <PublicationAction
                key={review.reviewHash}
                url={`/api/v1/weddings/${wedding.id}/email-campaigns`}
                payload={{ kind: "invitation", householdIds: [householdId], eventIds: review.eventIds, designVersionId: review.designVersionId, expectedReviewHash: review.reviewHash }}
                responseId="campaignId"
                destination={`${back}/email/{id}`}
                label="Send invitation email"
                confirmation="I have checked the recipient and invitation details."
                pendingLabel="Submitting invitation email…"
                uncertainMessage="We couldn’t confirm whether the email was queued. Retry the same submission to check."
                disabled={review.issues.length > 0}
              />}
            </section>
            <InvitationEmailPreview snapshot={review.snapshot} />
          </div>
        )}
        <section className="workspace-panel">
          <h2>Recent email requests</h2>
          {history.length ? <ul className="publication-events">{history.map(row => <li key={row.id}><Link href={`${back}/email/${row.id}`}>{date.format(new Date(row.date))}</Link></li>)}</ul> : <p>No requests for this household yet.</p>}
        </section>
      </main>
    </WorkspaceShell>
  );
}
