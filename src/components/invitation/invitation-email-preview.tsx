import type { InvitationEmailSnapshot } from "@/modules/invitation-email/message";

export function InvitationEmailPreview({ snapshot }: { snapshot: InvitationEmailSnapshot }) {
  return (
    <section className="design-preview-panel">
      <h2>Email preview</h2>
      <p><strong>Subject</strong> {snapshot.subject}</p>
      <div className="workspace-panel">
        <p className="wedding-kicker">Make My Marriage</p>
        <h3>{snapshot.couple}</h3>
        <p>{snapshot.greeting}</p>
        <p>{snapshot.body}</p>
        <ul className="publication-events">
          {snapshot.events.map((event, index) => <li key={index}>{event.name} · {event.time} · {event.venue}</li>)}
        </ul>
        <span className="button button-primary">View your invitation</span>
        <p>A fallback link is included in the email.</p>
        <p>One response applies to your household.</p>
      </div>
    </section>
  );
}
