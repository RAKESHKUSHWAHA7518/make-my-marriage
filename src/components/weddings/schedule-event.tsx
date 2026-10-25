"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { eventDate, eventTime } from "@/modules/events/schema";

export function ScheduleEvent({ weddingId, eventId, version, name, startsAt, venue, timezone }: {
  weddingId: string; eventId: string; version: number; name: string; startsAt: string; venue: string; timezone: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const submission = useRef<{ key: string; body: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");

  async function schedule() {
    if (locked.current || blocked) return;
    submission.current ??= { key: crypto.randomUUID(), body: JSON.stringify({ expectedVersion: version, status: "scheduled" }) };
    const saved = submission.current;
    locked.current = true; setPending(true); setError("");
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/events/${eventId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key, "X-MMM-Wedding-Timezone": timezone },
        body: saved.body, signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (response.ok && result.data?.id === eventId && result.data?.status === "scheduled") {
        dialog.current?.close();
        router.replace(`/wedding/events/${eventId}?scheduled=1`); router.refresh(); return;
      }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      setBlocked(true); setUncertain(false);
      setError(result.error?.message ?? "This event could not be scheduled. Reload its latest details before trying again.");
    } catch {
      setUncertain(true);
      setError("We couldn’t confirm whether the event was scheduled. Retry the same action safely, or close this dialog and refresh the event details. If rate-limited, wait before retrying.");
    } finally { locked.current = false; setPending(false); }
  }

  return <>
    <button type="button" className="button button-primary" onClick={() => dialog.current?.showModal()}>Mark as scheduled</button>
    <dialog ref={dialog} className="wedding-dialog event-discard-dialog" aria-labelledby="schedule-event-title" onCancel={(event) => { if (locked.current) event.preventDefault(); }}>
      <h2 id="schedule-event-title">Schedule this event?</h2>
      <p><strong>{name}</strong><br />{eventDate(startsAt, timezone)} · {eventTime(startsAt, timezone)}<br />{venue}<br />{timezone}</p>
      <p>Scheduled events are eligible for viewing only by households explicitly invited to them. This action does not send invitations or publish your public wedding website.</p>
      <p>Guest invitations and guest viewing are coming in a later feature. Returning a scheduled event to Draft and editing scheduled details are not available yet.</p>
      {error && <p role="alert" className="event-form-error">{error}</p>}
      <div className="event-form-actions">
        <button type="button" className="button button-secondary" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>{uncertain || blocked ? "Close" : "Keep as draft"}</button>
        {blocked ? <button type="button" className="button button-primary" onClick={() => { dialog.current?.close(); router.refresh(); }}>Reload event details</button>
          : <button type="button" className="button button-primary" disabled={pending} onClick={schedule}>{pending ? "Scheduling…" : uncertain ? "Retry scheduling" : "Confirm scheduling"}</button>}
      </div>
    </dialog>
  </>;
}
