"use client";
import Link from "next/link";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { createEventSchema, eventTypeLabels, eventTypes, localEventInstant, eventLocalFields } from "@/modules/events/schema";
import type { EventView } from "@/modules/events/service";
import { WeddingIcon } from "./wedding-icon";

export function EventForm({ weddingId, timezone, initial }: { weddingId: string; timezone: string; initial?: EventView }) {
  const back = initial ? `/wedding/events/${initial.id}` : "/wedding/events";
  const start = initial ? eventLocalFields(initial.startsAt, timezone) : undefined;
  const end = initial?.endsAt ? eventLocalFields(initial.endsAt, timezone) : undefined;
  const reloadRequested = useRef(false);
  const leaving = useRef(false);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const destination = useRef(back);
  const locked = useRef(false);
  const submission = useRef<{ key: string; input: unknown } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  useUnsavedNavigation({ dirty, pending, leaving, destination, reloadRequested, dialog: discardDialog });

  const errorFor = (name: string) => fields[name] ? <small id={`error-${name}`} className="event-field-error">{fields[name]}</small> : null;
  const attrs = (name: string) => ({ "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `error-${name}` : undefined });
  function focusError() { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || blocked || (initial && !dirty && !submission.current)) return;
    setError(""); setFields({});
    if (!submission.current) {
      const form = event.currentTarget, data = new FormData(form);
      const value = (name: string) => String(data.get(name) ?? "").trim();
      const errors: Record<string, string> = {};
      for (const name of ["name", "type", "startDate", "startTime", "venue.name", "venue.address"]) if (!value(name)) errors[name] = "Please complete this field.";
      for (const name of ["startDate", "startTime", "endDate", "endTime"]) {
        const control = form.elements.namedItem(name);
        if (control instanceof HTMLInputElement && control.validity.badInput) errors[name] = "Enter a complete, valid date or time.";
      }
      let startsAt = "", endsAt: string | undefined;
      if (!errors.startDate && !errors.startTime) {
        try { startsAt = initial && value("startDate") === start?.date && value("startTime") === start?.time ? initial.startsAt : localEventInstant(value("startDate"), value("startTime"), timezone); }
        catch (e) { errors.startTime = (e as Error).message; }
      }
      if (value("endDate") || value("endTime")) {
        if (!value("endDate")) errors.endDate = "Enter an end date, or clear the end time.";
        if (!value("endTime")) errors.endTime = "Enter an end time, or clear the end date.";
        if (!errors.endDate && !errors.endTime) {
          try { endsAt = initial?.endsAt && value("endDate") === end?.date && value("endTime") === end?.time ? initial.endsAt : localEventInstant(value("endDate"), value("endTime"), timezone); }
          catch (e) { errors.endTime = (e as Error).message; }
        }
      }
      if (Object.keys(errors).length) { setFields(errors); setError("Please check the highlighted fields."); focusError(); return; }
      const parsed = createEventSchema.safeParse({ name: value("name"), type: value("type"), startsAt, ...(endsAt ? { endsAt } : {}), venue: { name: value("venue.name"), address: value("venue.address"), ...(value("venue.mapUrl") ? { mapUrl: value("venue.mapUrl") } : {}) }, ...(value("description") ? { description: value("description") } : {}), ...(value("dressCode") ? { dressCode: value("dressCode") } : {}), status: "draft" });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) errors[issue.path.join(".") === "endsAt" ? "endTime" : issue.path.join(".")] = issue.message;
        setFields(errors); setError("Please check the highlighted fields."); focusError(); return;
      }
      const editable = { name: parsed.data.name, type: parsed.data.type, startsAt: parsed.data.startsAt, venue: parsed.data.venue };
      submission.current = { key: crypto.randomUUID(), input: initial ? { ...editable, endsAt: endsAt ?? null, description: value("description") || null, dressCode: value("dressCode") || null, expectedVersion: initial.version } : parsed.data };
    }
    const saved = submission.current;
    locked.current = true; setPending(true);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/events${initial ? `/${initial.id}` : ""}`, { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key, "X-MMM-Wedding-Timezone": timezone }, body: JSON.stringify(saved.input), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && /^[a-f0-9]{24}$/.test(result.data?.id) && (!initial || result.data.id === initial.id)) {
        leaving.current = true; setDirty(false); setUncertain(false);
        router.replace(`/wedding/events/${result.data.id}?${initial ? "updated" : "created"}=1`); router.refresh(); return;
      }
      // A rate-limited retry may precede reconciliation of an earlier committed save.
      // Keep its immutable input/key and the retry-only state until confirmed.
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      submission.current = null; setUncertain(false);
      setError(result.error?.message ?? "The event could not be saved. Please check your entries.");
      const codes = ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "EVENT_NOT_DRAFT", "WEDDING_ARCHIVED", "WEDDING_TIMEZONE_CHANGED", "NOT_FOUND", "UNAUTHENTICATED", "FORBIDDEN"];
      if (codes.includes(result.error?.code)) setBlocked(true);
      const errors: Record<string, string> = {};
      for (const issue of result.error?.fields ?? []) errors[issue.path === "endsAt" ? "endTime" : issue.path === "startsAt" ? "startTime" : issue.path] = issue.message;
      setFields(errors); focusError();
    } catch {
      setUncertain(true);
      setError(initial ? "We couldn’t confirm whether your changes were saved. Check the event details or retry the same save. If rate-limited, wait before retrying." : "We could not confirm whether this event was saved. Your entries are preserved. Check the event list, or retry the same save safely.");
    } finally { locked.current = false; setPending(false); }
  }

  return <>
    <form ref={formRef} className="event-form" noValidate onSubmit={save} onChange={() => {
      const controls = Array.from(formRef.current?.elements ?? []);
      setDirty(controls.some((control) => control instanceof HTMLInputElement ? control.type === "radio" ? control.checked !== control.defaultChecked : control.value !== control.defaultValue : control instanceof HTMLTextAreaElement && control.value !== control.defaultValue));
      setFields({});
    }}>
      {error && <div className="event-form-error" role="alert"><strong>{error}</strong>{uncertain && <Link href={back}>{initial ? "Check event details →" : "Check event list →"}</Link>}{blocked && <><p>Reload the latest details before continuing. Your entries will stay visible until you confirm.</p><button type="button" className="button button-secondary" onClick={() => { reloadRequested.current = true; discardDialog.current?.showModal(); }}>Reload latest details</button></>}</div>}
      <fieldset disabled={pending || uncertain || blocked}>
        <section className="workspace-panel event-form-section"><header><span>1</span><div><h2>Event information</h2><p>The essentials for your celebration.</p></div></header>
          <label>Event name <b>*</b><input name="name" defaultValue={initial?.name ?? ""} maxLength={200} placeholder="e.g. Haldi ceremony" required {...attrs("name")} />{errorFor("name")}</label>
          <fieldset className="event-type-options"><legend>Event type <b>*</b></legend>{eventTypes.map((type) => <label key={type}><input type="radio" name="type" value={type} defaultChecked={initial?.type === type} required {...attrs("type")} /><span>{eventTypeLabels[type]}</span></label>)}</fieldset>{errorFor("type")}
        </section>
        <section className="workspace-panel event-form-section"><header><span>2</span><div><h2>Date &amp; time</h2><p>Set the schedule for your celebration.</p></div></header>
          <aside className="event-privacy"><WeddingIcon name="clock" /><p>All times are in <strong>{timezone}</strong>. Leave the end date and time blank if they are not decided.</p></aside>
          <div className="event-form-columns"><div><label>Start date <b>*</b><input type="date" name="startDate" defaultValue={start?.date ?? ""} min="1000-01-01" max="9999-12-31" required {...attrs("startDate")} />{errorFor("startDate")}</label><label>Start time <b>*</b><input type="time" name="startTime" defaultValue={start?.time ?? ""} required {...attrs("startTime")} />{errorFor("startTime")}</label></div><div><label>End date <small>(Optional)</small><input type="date" name="endDate" defaultValue={end?.date ?? ""} min="1000-01-01" max="9999-12-31" {...attrs("endDate")} />{errorFor("endDate")}</label><label>End time <small>(Optional)</small><input type="time" name="endTime" defaultValue={end?.time ?? ""} {...attrs("endTime")} />{errorFor("endTime")}</label></div></div>
        </section>
        <section className="workspace-panel event-form-section"><header><span>3</span><div><h2>Venue</h2><p>Where you’ll come together.</p></div></header>
          <label>Venue name <b>*</b><input name="venue.name" defaultValue={initial?.venue.name ?? ""} required maxLength={200} placeholder="e.g. Royal Courtyard" {...attrs("venue.name")} />{errorFor("venue.name")}</label>
          <label>Venue address <b>*</b><textarea name="venue.address" defaultValue={initial?.venue.address ?? ""} required maxLength={200} rows={3} placeholder="Street address, city and postal code" {...attrs("venue.address")} />{errorFor("venue.address")}</label>
          <label>Map link <small>(Optional HTTPS link)</small><input name="venue.mapUrl" defaultValue={initial?.venue.mapUrl ?? ""} type="url" maxLength={2000} placeholder="https://maps.google.com/…" {...attrs("venue.mapUrl")} />{errorFor("venue.mapUrl")}</label>
        </section>
        <section className="workspace-panel event-form-section"><header><span>4</span><div><h2>Additional details</h2><p>Optional guidance for your planning family.</p></div></header>
          <label>Dress code <small>(Optional)</small><input name="dressCode" defaultValue={initial?.dressCode ?? ""} maxLength={200} placeholder="e.g. Festive yellow attire" {...attrs("dressCode")} />{errorFor("dressCode")}</label>
          <label>Description <small>(Optional)</small><textarea name="description" defaultValue={initial?.description ?? ""} maxLength={10000} rows={4} placeholder="Notes and traditions for your planning family…" {...attrs("description")} />{errorFor("description")}</label>
        </section>
      </fieldset>
      <footer className="event-form-footer"><p><WeddingIcon name="lock" />This event is a private draft. Saving {initial ? "changes" : "it"} won’t invite guests or publish it on your wedding website.</p><div className="event-form-actions"><Link href={back} className="button button-secondary" aria-disabled={pending}>Cancel</Link><button className="button button-primary" type="submit" disabled={pending || blocked || (!!initial && !dirty && !uncertain)}>{pending ? initial ? "Saving changes…" : "Saving event…" : uncertain ? "Retry saving" : initial ? "Save changes" : "Save draft"}</button></div></footer>
    </form>
    <dialog ref={discardDialog} className="wedding-dialog event-discard-dialog" aria-labelledby="discard-event-title"><h2 id="discard-event-title">{initial ? "Discard your changes?" : "Discard this event draft?"}</h2><p>Your unsaved entries will be lost.{uncertain ? " An earlier save may have succeeded; check the saved details before continuing." : ""}</p><div className="event-form-actions"><button type="button" className="button button-secondary" autoFocus onClick={() => { reloadRequested.current = false; discardDialog.current?.close(); }}>Keep editing</button><button type="button" className="button button-primary" onClick={() => { leaving.current = true; setDirty(false); discardDialog.current?.close(); if (reloadRequested.current) window.location.reload(); else router.push(destination.current); }}>Discard changes</button></div></dialog>
  </>;
}
