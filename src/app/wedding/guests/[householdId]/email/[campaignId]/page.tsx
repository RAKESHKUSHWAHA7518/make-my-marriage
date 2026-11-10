import Link from "next/link";
import { notFound } from "next/navigation";
import { eventWorkspace } from "@/modules/events/page-session";
import { AccountError } from "@/modules/identity/security";
import { invitationEmailDetails } from "@/modules/invitation-email/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { PublicationAction } from "@/components/designs/publication-actions";
import { InvitationEmailPreview } from "@/components/invitation/invitation-email-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation email details | Make My Marriage" };

const labels: Record<string, string> = {
  queued: "Queued",
  accepted: "Accepted by email provider",
  delivered: "Delivered",
  failed: "Delivery failed",
  unknown: "Sending status uncertain",
  suppressed: "Not sent · Invitation unavailable",
  cancelled: "Cancelled",
};
const descriptions: Record<string, string> = {
  queued: "The email request is saved and waiting to be processed.",
  accepted: "The email provider accepted the message. Delivery confirmation is pending.",
  delivered: "The email provider confirmed delivery.",
  failed: "The email provider reported a failure. Check the household’s contact details.",
  unknown: "We can’t confirm the outcome yet. Check the current status before taking further action.",
  suppressed: "The invitation no longer met the sending requirements when it was processed.",
  cancelled: "The pending email request was cancelled.",
};

export default async function InvitationEmailDetailsPage({ params }: { params: Promise<{ householdId: string; campaignId: string }> }) {
  const { user, wedding } = await eventWorkspace();
  const { householdId, campaignId } = await params;
  const back = `/wedding/guests/${householdId}`;
  const details = await invitationEmailDetails(user, wedding.id, campaignId).catch(error => {
    if (error instanceof AccountError && error.status === 404) notFound();
    throw error;
  });
  if (details.householdId !== householdId) notFound();
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: wedding.timezone });
  const format = (value: string) => date.format(new Date(value));

  return (
    <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="guests">
      <main className="workspace-main designs-page">
        <Link className="wedding-back" href={back}>← Back to household</Link>
        <header className="event-page-heading"><div><h1>{details.status === "queued" || details.status === "unknown" ? "Invitation email progress" : "Invitation email details"}</h1><p>{details.snapshot.household}</p></div></header>
        <div className="design-editor-grid">
          <section className="workspace-panel">
            <h2>{labels[details.status] ?? "Status unavailable"}</h2>
            <p role="status">{descriptions[details.status]}</p>
            <dl className="workspace-facts">
              <div><dt>Reviewed recipient</dt><dd>{details.snapshot.recipient} · {details.snapshot.address}</dd></div>
              <div><dt>Requested</dt><dd>{format(details.createdAt)}</dd></div>
              {details.acceptedAt && <div><dt>Accepted</dt><dd>{format(details.acceptedAt)}</dd></div>}
              {details.deliveredAt && <div><dt>Delivered</dt><dd>{format(details.deliveredAt)}</dd></div>}
              {details.cancelledAt && <div><dt>Cancelled</dt><dd>{format(details.cancelledAt)}</dd></div>}
              <div><dt>Published card</dt><dd>{details.snapshot.card ? `${details.snapshot.card.name} · Version ${details.snapshot.card.revision}` : "No card selected"}</dd></div>
            </dl>
            <div className="design-actions">
              <a className="button button-secondary" href={`${back}/email/${campaignId}`}>Check status</a>
              <Link className="button button-secondary" href={`${back}/email`}>Email history</Link>
            </div>
            {details.canCancel && <PublicationAction
              url={`/api/v1/weddings/${wedding.id}/email-campaigns/${campaignId}/cancel`}
              payload={{ expectedVersion: details.version }}
              destination={`${back}/email/${campaignId}`}
              label="Cancel pending email"
              confirmation="I want to stop this pending request. An email already handed to the provider cannot be recalled."
              pendingLabel="Cancelling…"
              uncertainMessage="We couldn’t confirm the cancellation. Retry to check the same request."
            />}
          </section>
          <InvitationEmailPreview snapshot={details.snapshot} />
        </div>
      </main>
    </WorkspaceShell>
  );
}
