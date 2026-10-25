"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
import { createHouseholdSchema } from "@/modules/households/schema";
import type { GuestEvent, HouseholdView } from "@/modules/households/service";
import { eventDate, eventTime } from "@/modules/events/schema";

export function GuestForm({ weddingId, timezone, choices, initial }: { weddingId: string; timezone: string; choices: GuestEvent[]; initial?: HouseholdView }) {
  const router = useRouter(), back = initial ? `/wedding/guests/${initial.id}` : "/wedding/guests";
  const formRef = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const leaving = useRef(false), reloadRequested = useRef(false), destination = useRef(back), locked = useRef(false);
  const submission = useRef<{ key: string; input: unknown } | null>(null);
  const [dirty, setDirty] = useState(false), [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({}), [error, setError] = useState("");
  const [party, setParty] = useState(String(initial?.maxGuests ?? 1)), [search, setSearch] = useState("");
  const [selected, setSelected] = useState(initial?.invitedEventIds ?? []);
  const events = [...choices, ...(initial?.events.filter(e => !choices.some(c => c.id === e.id)) ?? [])];
  useUnsavedNavigation({ dirty, pending, leaving, destination, reloadRequested, dialog });
  const errorFor = (name: string) => fields[name] && <small id={`guest-${name}-error`} className="event-field-error">{fields[name]}</small>;
  const attrs = (name: string) => ({ "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `guest-${name}-error` : undefined });
  const focusError = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || blocked || (initial && !dirty && !submission.current)) return;
    setError(""); setFields({});
    if (!submission.current) {
      const data = new FormData(event.currentTarget), value = (name: string) => String(data.get(name) ?? "").trim();
      const parsed = createHouseholdSchema.safeParse({ displayName: value("name"), representative: { name: value("name"), ...(value("email") ? { email: value("email") } : {}), ...(value("phone") ? { phone: value("phone") } : {}) }, maxGuests: Number(party), invitedEventIds: selected, ...(value("notes") ? { notes: value("notes") } : {}), side: initial?.side ?? "other", tags: initial?.tags ?? [] });
      if (!parsed.success) { setFields(Object.fromEntries(parsed.error.issues.map(i => [i.path[0] === "displayName" ? "representative.name" : i.path.join("."), i.message]))); setError("Please check the highlighted fields."); focusError(); return; }
      if (selected.some(id => !choices.some(e => e.id === id))) { setFields({ invitedEventIds: "Remove or replace unavailable celebrations before saving." }); setError("Please check the highlighted fields."); focusError(); return; }
      submission.current = { key: crypto.randomUUID(), input: initial ? { ...parsed.data, notes: value("notes") || null, expectedVersion: initial.version } : parsed.data };
    }
    locked.current = true; setPending(true);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/households${initial ? `/${initial.id}` : ""}`, { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": submission.current.key }, body: JSON.stringify(submission.current.input), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && /^[a-f0-9]{24}$/.test(result.data?.id) && (!initial || result.data.id === initial.id)) { leaving.current = true; setDirty(false); router.replace(`/wedding/guests/${result.data.id}?${initial ? "updated" : "created"}=1`); router.refresh(); return; }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      submission.current = null; setUncertain(false); setError(result.error?.message ?? "Could not save the guest group.");
      if (["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "WEDDING_ARCHIVED", "NOT_FOUND", "UNAUTHENTICATED", "FORBIDDEN", "GUEST_REMOVED", "GUEST_LIMIT_BELOW_RSVP", "RSVP_SCOPE_REVIEW_REQUIRED"].includes(result.error?.code)) setBlocked(true);
      if (result.error?.code === "EVENT_UNAVAILABLE") setFields({ invitedEventIds: result.error.message });
      else if (result.error?.fields) setFields(Object.fromEntries(result.error.fields.map((f: { path: string; message: string }) => [f.path === "displayName" ? "representative.name" : f.path, f.message])));
      focusError();
    } catch { setUncertain(true); setError("We could not confirm the save. Your entries are preserved. Check the saved guest groups or retry the same save. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  const frozen = pending || uncertain || blocked;
  return <>
    <form ref={formRef} className="guest-form" noValidate onSubmit={save} aria-busy={pending} onChange={e => { const control = e.target; if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && control.name) setDirty(true); }}>
      {error && <div className="event-form-error" role="alert"><p>{error}</p>{uncertain && <Link href={back}>Check saved details →</Link>}{blocked && <button type="button" className="button button-secondary" onClick={() => { reloadRequested.current = true; dialog.current?.showModal(); }}>Reload latest details</button>}</div>}
      {initial && <aside className="wedding-notice"><WeddingIcon name="people" /><span>Editing <strong>{initial.displayName}</strong> · RSVP {initial.rsvp.status.replaceAll("_", " ")}</span></aside>}
      <fieldset disabled={frozen} className="guest-fieldset">
        <section className="workspace-panel guest-form-section">
          <header><span>1</span><div><h2>Representative information</h2><p>The main contact for this invitation or family group.</p></div></header>
          <label>Representative name <b>*</b><input name="name" defaultValue={initial?.representative.name ?? ""} maxLength={200} autoComplete="name" required placeholder="e.g. Rajesh Kapoor or The Kapoor Family" {...attrs("representative.name")} />{errorFor("representative.name")}</label>
          <div className="guest-form-columns"><label>Email address <small>(Optional)</small><input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={initial?.representative.email ?? ""} {...attrs("representative.email")} />{errorFor("representative.email")}</label><label>Phone number <small>(Optional)</small><input name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={initial?.representative.phone ?? ""} placeholder="Include country code when known" {...attrs("representative.phone")} />{errorFor("representative.phone")}</label></div>
        </section>
        <section className="workspace-panel guest-form-section">
          <header><span>2</span><div><h2>Party size &amp; invited celebrations</h2><p>Choose the maximum number of people and their celebrations.</p></div></header>
          <div className="guest-party"><label htmlFor="guest-party-size">Maximum party size <b>*</b><small>Include the representative in this number.</small></label><div className="guest-stepper"><button type="button" aria-label="Decrease maximum party size" disabled={Number(party) <= 1} onClick={() => { setParty(String(Math.max(1, (Number(party) || 1) - 1))); setDirty(true); }}>−</button><input id="guest-party-size" name="maxGuests" type="number" min={1} max={2147483647} step={1} required value={party} onChange={e => setParty(e.target.value)} {...attrs("maxGuests")} /><button type="button" aria-label="Increase maximum party size" disabled={Number(party) >= 2147483647} onClick={() => { setParty(String(Math.min(2147483647, (Number(party) || 0) + 1))); setDirty(true); }}>+</button></div></div>{errorFor("maxGuests")}
          <fieldset className="guest-event-picker" {...attrs("invitedEventIds")} tabIndex={-1}><legend>Invited celebrations <b>*</b> <small>{selected.length} selected</small></legend>
            <label className="sr-only" htmlFor="guest-event-search">Search celebrations by name or venue</label><input id="guest-event-search" type="search" placeholder="Search celebrations by name or venue…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="guest-event-options">{events.map(e => <label key={e.id} hidden={!!search && !`${e.name} ${e.venue ?? ""}`.toLowerCase().includes(search.toLowerCase())} className={`guest-event-option${!e.available ? " guest-event-unavailable" : ""}`}><input type="checkbox" name="invitedEventIds" value={e.id} checked={selected.includes(e.id)} onChange={v => setSelected(v.target.checked ? [...selected, e.id] : selected.filter(id => id !== e.id))} /><span><strong>{e.name}</strong><small>{e.startsAt ? `${eventDate(e.startsAt, timezone)} · ${eventTime(e.startsAt, timezone)}` : "Date unavailable"}{e.venue ? ` · ${e.venue}` : ""}</small>{!e.available && <small>Unavailable — uncheck or replace before saving.</small>}</span><span className="guest-status">{e.available ? e.status : "Unavailable"}</span></label>)}</div>
            {search && !events.some(e => `${e.name} ${e.venue ?? ""}`.toLowerCase().includes(search.toLowerCase())) && <p>No celebrations match your search.</p>}
            {!choices.length && <p className="wedding-notice">No eligible celebrations yet. <Link href="/wedding/events">Create an event first →</Link></p>}
          </fieldset>{errorFor("invitedEventIds")}
          <p className="guest-helper">Draft selections are private planning records. Selecting a celebration does not publish it or send an invitation.</p>
        </section>
        <section className="workspace-panel guest-form-section"><header><span>3</span><div><h2>Private planning notes</h2><p>Visible only to your wedding’s planning family.</p></div></header><label>Notes <small>(Optional)</small><textarea name="notes" maxLength={10000} rows={5} defaultValue={initial?.notes ?? ""} placeholder="Dietary preferences, accessibility needs or family notes…" {...attrs("notes")} />{errorFor("notes")}</label></section>
      </fieldset>
      <footer className="guest-form-footer"><p><WeddingIcon name="lock" /> Saving this group does not send an invitation.</p><div className="event-form-actions"><Link className="button button-secondary" href={back} aria-disabled={pending}>Cancel</Link><button type="submit" className="button button-primary" disabled={pending || blocked || (!initial && !choices.length) || (!!initial && !dirty && !uncertain)}>{pending ? "Saving guest group…" : uncertain ? "Retry saving" : initial ? "Save changes" : "Save guest group"}</button></div></footer>
    </form>
    <dialog ref={dialog} className="wedding-dialog event-discard-dialog" aria-labelledby="discard-guest-title"><h2 id="discard-guest-title">Discard your changes?</h2><p>Your unsaved entries will be lost.{uncertain && " An earlier save may have succeeded. Check the saved guest group before continuing."}</p><div className="event-form-actions"><button type="button" className="button button-secondary" autoFocus onClick={() => { reloadRequested.current = false; dialog.current?.close(); }}>Keep editing</button><button type="button" className="button button-primary" onClick={() => { leaving.current = true; setDirty(false); dialog.current?.close(); if (reloadRequested.current) window.location.reload(); else router.push(destination.current); }}>Discard changes</button></div></dialog>
  </>;
}
