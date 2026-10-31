"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { createVendorSchema, googleVendorFallbackName, vendorCategories, vendorCategoryLabels } from "@/modules/vendors/schema";
import type { VendorView } from "@/modules/vendors/service";

export function VendorForm({ weddingId, events, initial, googlePlaceId, suggestedCategory }: { weddingId: string; events: { id: string; name: string }[]; initial?: VendorView; googlePlaceId?: string; suggestedCategory?: string }) {
  const google = initial?.source === "GOOGLE_PLACES" || !!googlePlaceId;
  const router = useRouter(), back = initial ? `/wedding/vendors/${initial.id}` : "/wedding/vendors";
  const form = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false), leaving = useRef(false), reloadRequested = useRef(false), destination = useRef(back);
  const submission = useRef<{ key: string; input: unknown } | null>(null);
  const [dirty, setDirty] = useState(false), [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(""), [fields, setFields] = useState<Record<string, string>>({}), [signedOut, setSignedOut] = useState(false);
  const [existingVendorId, setExistingVendorId] = useState<string | null>(null);
  useUnsavedNavigation({ dirty, pending, leaving, destination, reloadRequested, dialog });
  const labels: Record<string, string> = { name: google ? "Private label" : "Vendor name", category: "Category", "contact.person": "Contact person", "contact.phone": "Phone number", "contact.email": "Email address", "contact.address": "Studio or business address", notes: "Private notes" };
  const attrs = (name: string) => ({ "aria-label": labels[name], "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `vendor-error-${name}` : undefined });
  const fieldError = (name: string) => fields[name] ? <small className="event-field-error" id={`vendor-error-${name}`}>{fields[name]}</small> : null;
  function focusError() { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current || blocked) return;
    setError(""); setFields({});
    if (!submission.current) {
      const data = new FormData(event.currentTarget), value = (name: string) => String(data.get(name) ?? "").trim();
      const contact = Object.fromEntries(["person", "phone", "email", "address"].flatMap(k => value(k) ? [[k, value(k)]] : []));
      const parsed = createVendorSchema.safeParse({ ...(google ? { source: "GOOGLE_PLACES", googlePlaceId: initial?.googlePlaceId ?? googlePlaceId } : { source: "MANUAL" }), name: google ? value("name") || undefined : value("name"), category: value("category"), contact: Object.keys(contact).length ? contact : undefined, eventIds: data.getAll("eventIds").map(String), notes: value("notes") || undefined });
      if (!parsed.success) {
        const errors: Record<string, string> = {}; for (const issue of parsed.error.issues) errors[issue.path[0] === "eventIds" ? "eventIds" : issue.path.join(".")] = issue.message;
        setFields(errors); setError("Please check the highlighted fields."); focusError(); return;
      }
      const editable = { name: parsed.data.name, category: parsed.data.category, contact: parsed.data.contact, eventIds: parsed.data.eventIds, notes: parsed.data.notes };
      submission.current = { key: crypto.randomUUID(), input: initial ? { ...editable, name: editable.name ?? googleVendorFallbackName, expectedVersion: initial.version, notes: editable.notes ?? null, contact: editable.contact ?? null } : parsed.data }; setDirty(true);
    }
    const saved = submission.current; locked.current = true; setPending(true);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/vendors${initial ? `/${initial.id}` : ""}`, { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key }, body: JSON.stringify(saved.input), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && /^[a-f0-9]{24}$/.test(result.data?.id) && (!initial || result.data.id === initial.id)) {
        leaving.current = true; setDirty(false); setUncertain(false); window.location.replace(result.data.status === "removed" ? "/wedding/vendors" : `/wedding/vendors/${result.data.id}`); return;
      }
      // A rate-limited retry may precede reconciliation of a previously committed save.
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      submission.current = null; setUncertain(false); setSignedOut(response.status === 401); setError(result.error?.message ?? "This vendor could not be saved.");
      if ([401, 403, 404, 409].includes(response.status)) setBlocked(true);
      if (result.error?.code === "VENDOR_ALREADY_SAVED" && /^[a-f0-9]{24}$/.test(result.error.existingVendorId)) setExistingVendorId(result.error.existingVendorId);
      const errors: Record<string, string> = {};
      for (const issue of result.error?.fields ?? []) errors[issue.path.startsWith("eventIds") ? "eventIds" : issue.path] = issue.message;
      if (result.error?.code === "EVENT_UNAVAILABLE") errors.eventIds = result.error.message;
      setFields(errors); focusError();
    } catch { setUncertain(true); setError("We couldn’t confirm whether this vendor was saved. Your original entries are preserved. Retry the same save to check. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  const unavailable = initial?.events.filter(e => !events.some(choice => choice.id === e.id)) ?? [];
  return <>
    <form ref={form} className="planning-vendor-form workspace-panel" onSubmit={save} noValidate onChange={() => { setDirty(true); setFields({}); }}>
      {google && <div className="planning-vendor-planning-note"><strong>Your private wedding details</strong><p>Google business information stays separate. Enter your own label, contacts and notes; these fields are not copied from Google. Saving does not book, contact or pay the business.</p></div>}
      {error && <div className="event-form-error" role="alert"><strong>{error}</strong>{blocked && <><p>Your entered details remain visible. Review the latest saved record before continuing.</p>{signedOut ? <Link href="/login">Sign in again</Link> : existingVendorId ? <Link className="button button-secondary" href={`/wedding/vendors/${existingVendorId}`}>Open existing vendor</Link> : <button type="button" className="button button-secondary" onClick={() => { reloadRequested.current = true; dialog.current?.showModal(); }}>Review latest details</button>}</>}</div>}
      <fieldset disabled={pending || uncertain || blocked}>
        <section className="planning-vendor-form-section"><h2><span>1</span>Basic details <small>Required</small></h2>
          <label><span>{google ? "Private label (optional)" : <>Vendor name <b>*</b></>}</span><input name="name" defaultValue={google && initial?.name === googleVendorFallbackName ? "" : initial?.name ?? ""} maxLength={200} required={!google} placeholder={google ? "e.g. Family’s preferred photographer" : "e.g. Royal Palace Decorators or Pandit Ji"} {...attrs("name")} />{fieldError("name")}</label>
          <label><span>Category <b>*</b></span><select name="category" defaultValue={initial?.category ?? suggestedCategory ?? ""} required {...attrs("category")}><option value="" disabled>Select vendor specialty</option>{vendorCategories.map(c => <option key={c} value={c}>{vendorCategoryLabels[c]}</option>)}</select>{fieldError("category")}</label>
        </section>
        <section className="planning-vendor-form-section"><h2><span>2</span>Primary contact <small>Optional</small></h2>
          <label>Contact person<input name="person" defaultValue={initial?.contact?.person ?? ""} maxLength={200} autoComplete="off" placeholder="e.g. Amit Sharma or manager name" {...attrs("contact.person")} />{fieldError("contact.person")}</label>
          <div className="planning-vendor-form-columns"><label>Phone number<input name="phone" type="tel" defaultValue={initial?.contact?.phone ?? ""} maxLength={40} placeholder="Include country code if known" {...attrs("contact.phone")} />{fieldError("contact.phone")}</label><label>Email address<input name="email" type="email" defaultValue={initial?.contact?.email ?? ""} maxLength={254} placeholder="contact@vendor.com" {...attrs("contact.email")} />{fieldError("contact.email")}</label></div>
          <label>Studio or business address<textarea name="address" rows={3} defaultValue={initial?.contact?.address ?? ""} maxLength={2000} placeholder="Studio / business address or city" {...attrs("contact.address")} />{fieldError("contact.address")}</label>
        </section>
        <section className="planning-vendor-form-section"><h2><span>3</span>Wedding association &amp; notes <small>Optional</small></h2>
          <fieldset className="planning-vendor-event-options"><legend>Related events</legend>{[...events, ...unavailable].map(e => <label key={e.id}><input type="checkbox" name="eventIds" value={e.id} defaultChecked={initial?.eventIds.includes(e.id)} {...attrs("eventIds")} /><span>{e.name}{unavailable.some(u => u.id === e.id) ? " · Unavailable — uncheck to remove" : ""}</span></label>)}</fieldset>{fieldError("eventIds")}
          <p className="planning-vendor-helper">{events.length || unavailable.length ? "Leave events unselected if this vendor is for the whole wedding." : "No events are available yet. This vendor will be wedding-wide."}</p>
          <label>Private notes<textarea name="notes" rows={5} defaultValue={initial?.notes ?? ""} maxLength={10000} placeholder="Coordination notes or family recommendations…" {...attrs("notes")} />{fieldError("notes")}</label><p className="planning-vendor-helper">Only your wedding’s planning family can see these details.</p>
        </section>
      </fieldset>
      <footer className="planning-vendor-form-actions"><Link className="button button-secondary" href={back} aria-disabled={pending}>Cancel</Link><button className="button button-primary" type="submit" disabled={pending || blocked}>{pending ? "Saving vendor…" : uncertain ? "Retry saving" : initial ? "Save changes" : "Save vendor"}</button></footer>
    </form>
    <dialog ref={dialog} className="wedding-dialog event-discard-dialog" aria-labelledby="discard-vendor-title"><h2 id="discard-vendor-title">Leave your unsaved entries?</h2><p>Your entries will be lost.{uncertain ? " An earlier save may have succeeded. Check the vendor list before adding it again." : ""}</p><div className="event-form-actions"><button className="button button-secondary" autoFocus onClick={() => { reloadRequested.current = false; dialog.current?.close(); }}>Keep reviewing</button><button className="button button-primary" onClick={() => { leaving.current = true; setDirty(false); dialog.current?.close(); if (reloadRequested.current) window.location.reload(); else router.push(destination.current); }}>Leave this form</button></div></dialog>
  </>;
}
