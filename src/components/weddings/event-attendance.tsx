"use client";

import { useEffect, useState } from "react";
import type { EventAttendance } from "@/modules/events/service";
import { eventStatusLabels } from "@/modules/events/schema";
import { WeddingIcon } from "./wedding-icon";

const labels = [
  ["attending", "Attending"], ["not_attending", "Not attending"],
  ["maybe", "Maybe"], ["pending", "Awaiting response"],
] as const;
const numbers = new Intl.NumberFormat("en-IN");

export function EventAttendancePanel({ weddingId, eventId }: { weddingId: string; eventId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ data: EventAttendance } | { error: true }>();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/v1/weddings/${weddingId}/events/${eventId}/attendance`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) throw Error("Attendance unavailable");
        const { data }: { data: EventAttendance } = await response.json();
        if (data.eventId !== eventId) throw Error("Unexpected event");
        if (!controller.signal.aborted) setResult({ data });
      } catch {
        if (!controller.signal.aborted) setResult({ error: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [weddingId, eventId, attempt]);

  const data = result && "data" in result ? result.data : undefined;
  const historical = data?.eventStatus === "cancelled" || data?.eventStatus === "removed";
  const awaiting = data && data.invitedHouseholds > 0 && data.counts.pending === data.invitedHouseholds;

  return <section className="workspace-panel event-attendance" aria-labelledby="event-attendance-title">
    <div className="event-attendance-heading">
      <h2 id="event-attendance-title"><WeddingIcon name="people" />{historical ? "Historical attendance" : "Attendance"}</h2>
      <span className="event-status">{historical ? eventStatusLabels[data.eventStatus] : "Family only"}</span>
    </div>
    {!result && <div role="status">
      <p>Loading attendance…</p>
      <div className="event-attendance-metrics" aria-hidden="true"><span /><span /></div>
    </div>}
    {result && "error" in result && <div className="event-attendance-notice">
      <p role="alert">Couldn’t load attendance.</p>
      <button type="button" className="button button-secondary" onClick={() => { setResult(undefined); setAttempt(value => value + 1); }}>Retry</button>
    </div>}
    {data && <>
      <p>{historical ? "Family history based on the household assignments and responses currently on record." : "Based on the saved RSVP for each household assigned to this event."}</p>
      <dl className="event-attendance-metrics">
        <div><dt>Invited households</dt><dd>{numbers.format(data.invitedHouseholds)} <small>households</small></dd></div>
        <div className="event-attendance-projection"><dt>{historical ? "Attending in saved RSVPs" : "Projected attendees"}</dt><dd>{numbers.format(data.projectedPeople)} <small>people</small></dd></div>
      </dl>
      {data.invitedHouseholds === 0 ? <p className="event-attendance-notice">No households invited{historical ? "." : " yet."}</p> : <>
        {awaiting && <p className="event-attendance-notice">No households have responded yet.{!historical && " The projected count can change as RSVPs arrive."}</p>}
        <dl className="event-attendance-breakdown" aria-label="RSVP breakdown by household">
          {labels.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{numbers.format(data.counts[key])}</dd></div>)}
        </dl>
      </>}
    </>}
  </section>;
}
