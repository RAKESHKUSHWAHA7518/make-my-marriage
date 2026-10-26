"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { rsvpSchema, responseLabels } from "@/modules/guest-access/schema";
import type { GuestSite } from "@/modules/guest-access/service";
export function RsvpForm({ site }: { site: GuestSite }) {
  const router = useRouter(), initial = site.rsvp, editing = initial.status !== "pending";
  const [status, setStatus] = useState<string>(editing ? initial.status : ""), [count, setCount] = useState(initial.status === "attending" ? String(initial.attendeeCount) : "");
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false), [error, setError] = useState("");
  const [field, setField] = useState("");
  const form = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null), destination = useRef("/guest"), leaving = useRef(false), reloadRequested = useRef(false), locked = useRef(false), submission = useRef<{ key: string; input: unknown } | null>(null);
  const dirty = status !== (editing ? initial.status : "") || (status === "attending" ? count !== (initial.status === "attending" ? String(initial.attendeeCount) : "") : false);
  useUnsavedNavigation({ dirty, pending, leaving, destination, reloadRequested, dialog });
  function fail(message: string, name: string) { setError(message); setField(name); requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current || blocked || !site.rsvp.editable || (editing && !dirty && !submission.current)) return;
    setError(""); setField("");
    if (!submission.current) {
      if (!status) { fail("Choose your response.", "status"); return; }
      const attendeeCount = status === "attending" ? Number(count) : 0;
      if (status === "attending" && (!count.trim() || !Number.isInteger(attendeeCount) || attendeeCount < 1 || attendeeCount > initial.maxGuests)) { fail(`Enter a whole number between 1 and ${initial.maxGuests}.`, "attendeeCount"); return; }
      const parsed = rsvpSchema.safeParse({ status, attendeeCount, expectedVersion: initial.version, expectedInvitationRevision: initial.invitationRevision });
      if (!parsed.success) { fail("Please check your response and count.", "attendeeCount"); return; }
      submission.current = { key: crypto.randomUUID(), input: parsed.data };
    }
    const saved = submission.current; locked.current = true; setPending(true);
    try {
      const response = await fetch("/api/v1/guest/rsvp", { method: "PUT", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key }, body: JSON.stringify(saved.input), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && ["attending", "not_attending", "maybe"].includes(result.data?.rsvp?.status) && Number.isInteger(result.data.rsvp.version)) { leaving.current = true; router.replace("/guest/response"); router.refresh(); return; }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      submission.current = null; setUncertain(false); setError(result.error?.message ?? "Your response could not be saved. Please retry.");
      if (response.status === 404 || response.status === 409 || response.status === 401 || response.status === 403) setBlocked(true);
      if (result.error?.code === "GUEST_LIMIT_EXCEEDED") { setField("attendeeCount"); requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }
    } catch { setUncertain(true); setError("We couldn’t confirm whether your response was saved. Check your saved response or retry the same save. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  return <>
    <form ref={form} className="rsvp-form" noValidate onSubmit={save}>
      {error && <div className="event-form-error" id="rsvp-error" role="alert"><p>{error}</p>{uncertain && <Link href="/guest/response" target="_blank" rel="noopener noreferrer">Check saved response (new tab) →</Link>}{blocked && <button type="button" className="button button-secondary" onClick={() => { reloadRequested.current = true; dialog.current?.showModal(); }}>Reload latest details</button>}</div>}
      <fieldset disabled={pending || uncertain || blocked} className="rsvp-choices" tabIndex={-1} aria-invalid={field === "status"} aria-describedby={field === "status" ? "rsvp-error" : undefined}><legend>Select your response</legend>{(["attending", "not_attending", "maybe"] as const).map((choice) => <label key={choice}><input type="radio" name="status" value={choice} checked={status === choice} onChange={() => { setStatus(choice); if (choice !== "attending") setCount(""); setError(""); setField(""); }} /><strong>{responseLabels[choice]}</strong></label>)}</fieldset>
      {status === "attending" && <section className="invitation-panel"><h2>How many people will attend?</h2><p>Include yourself in this number. Your invitation allows up to {initial.maxGuests} people, including you.</p><label>Attending people<input name="attendeeCount" type="number" inputMode="numeric" min={1} max={initial.maxGuests} step={1} value={count} disabled={pending || uncertain || blocked} aria-invalid={field === "attendeeCount"} aria-describedby={field === "attendeeCount" ? "rsvp-error" : undefined} onChange={(event) => { setCount(event.currentTarget.value); setError(""); setField(""); }} /></label></section>}
      <div className="event-form-actions"><Link className="button button-secondary" href="/guest" aria-disabled={pending}>Back to invitation</Link><button className="button button-primary" type="submit" disabled={pending || blocked || (editing && !dirty && !uncertain)}>{pending ? "Saving response…" : uncertain ? "Retry saving" : editing ? "Save changes" : "Save response"}</button></div>
    </form>
    <dialog ref={dialog} className="wedding-dialog event-discard-dialog" aria-labelledby="discard-rsvp-title"><h2 id="discard-rsvp-title">Discard your changes?</h2><p>Your unsaved response changes will be lost.{uncertain ? " An earlier save may have succeeded; check your saved response before changing it." : ""}</p><div className="event-form-actions"><button type="button" className="button button-secondary" autoFocus onClick={() => dialog.current?.close()}>Keep editing</button><button type="button" className="button button-primary" onClick={() => { leaving.current = true; dialog.current?.close(); if (reloadRequested.current) window.location.reload(); else router.push(destination.current); }}>Discard changes</button></div></dialog>
  </>;
}
