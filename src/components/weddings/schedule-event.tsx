"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { eventDate, eventTime, type EventStatus } from "@/modules/events/schema";

const actions = {
  scheduled: { label: "Mark as scheduled", title: "Schedule this event?", back: "Keep as draft", confirm: "Confirm scheduling", saving: "Scheduling…", retry: "Retry scheduling", detail: "Scheduled events are visible to eligible households explicitly invited to them. Scheduling does not send invitations or publish your public wedding website.", path: "" },
  completed: { label: "Mark as completed", title: "Mark this event as completed?", back: "Go back", confirm: "Mark as completed", saving: "Saving…", retry: "Retry update", detail: "This event stays in your family history and remains visible to eligible invited households.", path: "" },
  cancelled: { label: "Cancel event", title: "Cancel this event?", back: "Keep event", confirm: "Cancel event", saving: "Cancelling…", retry: "Retry cancellation", detail: "The event will be hidden from guest invitations and the public wedding page. Your family can still see its history. No email or WhatsApp message will be sent.", path: "/cancel" },
  removed: { label: "Remove event", title: "Remove this event?", back: "Keep event", confirm: "Remove event", saving: "Removing…", retry: "Retry removal", detail: "The event will leave the celebrations list and guest views. Your family can still find it in event history. No messages will be sent.", path: "/remove" },
};

export function ScheduleEvent({ weddingId, eventId, version, name, startsAt, venue, timezone, target = "scheduled" }: {
  weddingId: string; eventId: string; version: number; name: string; startsAt: string; venue: string; timezone: string; target?: Exclude<EventStatus, "draft">;
}) {
  const action = actions[target];
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
    submission.current ??= { key: crypto.randomUUID(), body: JSON.stringify({ expectedVersion: version, ...(!action.path ? { status: target } : {}) }) };
    const saved = submission.current;
    locked.current = true; setPending(true); setError("");
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/events/${eventId}${action.path}`, {
        method: action.path ? "POST" : "PATCH", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key, "X-MMM-Wedding-Timezone": timezone },
        body: saved.body, signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (response.ok && result.data?.id === eventId && result.data?.status === target) {
        dialog.current?.close();
        router.replace(`/wedding/events/${eventId}?${target}=1`); router.refresh(); return;
      }
      if (response.ok && result.data?.id === eventId) {
        setBlocked(true); setUncertain(false); setError("The event has changed. Reload to view its current status.");
        return;
      }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      setBlocked(true); setUncertain(false);
      setError(result.error?.message ?? "This action couldn’t be saved. Reload the event before trying again.");
    } catch {
      setUncertain(true);
      setError("We couldn’t confirm whether the action was saved. Retry the same action safely, or close this dialog and refresh the event details. If rate-limited, wait before retrying.");
    } finally { locked.current = false; setPending(false); }
  }

  return <>
    <button type="button" className={action.path ? "button button-secondary" : "button button-primary"} onClick={() => dialog.current?.showModal()}>{action.label}</button>
    <dialog ref={dialog} className="wedding-dialog event-discard-dialog" aria-labelledby={`event-${target}-title`} onCancel={(event) => { if (locked.current) event.preventDefault(); }}>
      <h2 id={`event-${target}-title`}>{action.title}</h2>
      <p><strong>{name}</strong><br />{eventDate(startsAt, timezone)} · {eventTime(startsAt, timezone)}<br />{venue}<br />{timezone}</p>
      <p>{action.detail}</p>
      {error && <p role="alert" className="event-form-error">{error}</p>}
      <div className="event-form-actions">
        <button type="button" className="button button-secondary" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>{uncertain || blocked ? "Close" : action.back}</button>
        {blocked ? <button type="button" className="button button-primary" onClick={() => { dialog.current?.close(); router.refresh(); }}>Reload event details</button>
          : <button type="button" className="button button-primary" disabled={pending} onClick={schedule}>{pending ? action.saving : uncertain ? action.retry : action.confirm}</button>}
      </div>
    </dialog>
  </>;
}
