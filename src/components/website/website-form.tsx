"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { eventDate } from "@/modules/events/schema";
import { patchWebsiteSchema, type WebsiteDraft } from "@/modules/website/schema";
import type { WebsiteEditor } from "@/modules/website/service";
import { PrivateCover } from "./private-cover";

export function WebsiteForm({ editor, weddingId, timezone, readOnly }: { editor: WebsiteEditor; weddingId: string; timezone: string; readOnly: boolean }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null), form = useRef<HTMLFormElement>(null), leaving = useRef(false), reloadRequested = useRef(false), destination = useRef("/wedding/website/preview"), locked = useRef(false);
  const submission = useRef<{ key: string; body: string } | null>(null);
  const [draft, setDraft] = useState<WebsiteDraft>(editor.draft), [version, setVersion] = useState(editor.draftVersion), [dirty, setDirty] = useState(false), [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(""), [fields, setFields] = useState<Record<string, string>>({}), [saved, setSaved] = useState(false), [photos, setPhotos] = useState(editor.covers.data), [cursor, setCursor] = useState(editor.covers.nextCursor), [loadingPhotos, setLoadingPhotos] = useState(false), [photoError, setPhotoError] = useState("");
  useUnsavedNavigation({ dirty, pending, leaving, destination, reloadRequested, dialog });
  const disabled = readOnly || !editor.enabled || pending || uncertain || blocked;
  const attrs = (name: string) => ({ "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `website-${name}` : undefined });
  const fieldError = (name: string) => fields[name] && <small className="event-field-error" id={`website-${name}`}>{fields[name]}</small>;
  function change(next: WebsiteDraft) { setDraft(next); setDirty(true); setSaved(false); setFields({}); }
  async function loadPhotos() {
    if (loadingPhotos || !cursor) return; setLoadingPhotos(true); setPhotoError("");
    try { const response = await fetch(`/api/v1/weddings/${weddingId}/public-page/cover-choices?cursor=${cursor}`, { cache: "no-store", signal: AbortSignal.timeout(20000) }); const result = await response.json(); if (!response.ok || !Array.isArray(result.data?.data)) throw Error(); setPhotos(previous => [...previous, ...result.data.data.filter((p: { id: string }) => !previous.some(v => v.id === p.id))]); setCursor(result.data.nextCursor); }
    catch { setPhotoError("Photo choices could not be loaded. Try again."); } finally { setLoadingPhotos(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (locked.current || blocked || readOnly || !editor.enabled) return; setError(""); setFields({});
    if (!submission.current) {
      const parsed = patchWebsiteSchema.safeParse({ draft, expectedDraftVersion: version });
      if (!parsed.success) { const errors: Record<string, string> = {}; for (const i of parsed.error.issues) errors[i.path.join(".")] = i.message; setFields(errors); setError("Please check the highlighted fields."); requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
      submission.current = { key: crypto.randomUUID(), body: JSON.stringify(parsed.data) };
    }
    locked.current = true; setPending(true);
    try {
      const r = await fetch(`/api/v1/weddings/${weddingId}/public-page`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": submission.current.key }, body: submission.current.body, signal: AbortSignal.timeout(20000) }); const result = await r.json();
      if (r.ok && Number.isInteger(result.data?.draftVersion) && result.data.draftVersion > version) { setDraft(result.data.draft); setVersion(result.data.draftVersion); submission.current = null; setDirty(false); setUncertain(false); setSaved(true); return; }
      if (r.ok || r.status === 429 || r.status >= 500) throw Error();
      submission.current = null; setUncertain(false); setError(result.error?.message ?? "The draft could not be saved.");
      setBlocked([401, 403, 404, 409].includes(r.status)); const errors: Record<string, string> = {};
      for (const i of result.error?.fields ?? []) errors[i.path] = i.message;
      if (result.error?.code === "EVENT_UNAVAILABLE") errors["draft.selectedEventIds"] = result.error.message;
      if (result.error?.code === "COVER_UNAVAILABLE") errors["draft.coverAssetId"] = result.error.message;
      setFields(errors);
    } catch { setUncertain(true); setError("We couldn’t confirm whether your draft was saved. Retry with your original entries. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  return <><form className="website-form" ref={form} onSubmit={save} noValidate>
    {error && <div className="event-form-error" role="alert">{error}{blocked && <p>Your entries remain visible. <button className="button button-secondary" type="button" onClick={() => { reloadRequested.current = true; dialog.current?.showModal(); }}>Review latest draft</button><Link href="/login">Sign in again</Link></p>}</div>}
    <p className="website-save-status" role="status">{pending ? "Saving draft…" : uncertain ? "Save not confirmed · Original entries preserved" : saved ? "Draft saved · Your changes are still private" : dirty ? "Unsaved changes" : `Saved draft · Version ${version}`}</p>
    {!editor.enabled && <p className="wedding-notice">Draft saving has not been activated yet. Your existing saved preview remains private.</p>}
    {readOnly && <p className="wedding-notice">This wedding is archived. Your saved website draft is read-only.</p>}
    <fieldset disabled={disabled}>
      <section className="workspace-panel website-section"><h2><span>01</span>Couple’s display names</h2><label>Names for your website<input value={draft.coupleNames} required maxLength={403} onChange={e => change({ ...draft, coupleNames: e.target.value })} {...attrs("draft.coupleNames")} /></label>{fieldError("draft.coupleNames")}<p className="website-hint">Changing these names affects only this website draft, not your saved wedding details.</p></section>
      <section className="workspace-panel website-section"><h2><span>02</span>Introduction &amp; welcome</h2><label>Introduction <small>(Optional)</small><textarea rows={6} value={draft.intro} maxLength={10000} onChange={e => change({ ...draft, intro: e.target.value })} {...attrs("draft.intro")} /></label>{fieldError("draft.intro")}<p className="website-helper">A plain-text welcome for your visitors. {draft.intro.length.toLocaleString("en-IN")} / 10,000 characters.</p></section>
      <section className="workspace-panel website-section"><h2><span>03</span>Wedding date</h2><label>Website date <small>(Optional)</small><input type="date" min="1000-01-01" max="9999-12-31" value={draft.date ?? ""} onChange={e => change({ ...draft, date: e.target.value || undefined })} {...attrs("draft.date")} /></label>{fieldError("draft.date")}<button type="button" className="button button-secondary" onClick={() => change({ ...draft, date: undefined })}>Do not show a date</button><p className="website-helper">No date or countdown will appear when this is empty.</p></section>
      <section className="workspace-panel website-section"><h2><span>04</span>Cover photo</h2><label>Choose an uploaded photo <small>(Optional)</small><select value={draft.coverAssetId ?? ""} onChange={e => change({ ...draft, coverAssetId: e.target.value || undefined })} {...attrs("draft.coverAssetId")}><option value="">No cover photo</option>{draft.coverAssetId && !photos.some(p => p.id === draft.coverAssetId) && <option value={draft.coverAssetId}>Unavailable photo — choose another or no cover</option>}{photos.map(p => <option key={p.id} value={p.id}>{p.filename}</option>)}</select></label>{fieldError("draft.coverAssetId")}{draft.coverAssetId && photos.some(p => p.id === draft.coverAssetId) && <PrivateCover assetId={draft.coverAssetId} />}{cursor && <button className="button button-secondary" type="button" disabled={loadingPhotos} onClick={loadPhotos}>{loadingPhotos ? "Loading photos…" : "Load more photos"}</button>}{photoError && <p role="alert">{photoError}</p>}{!photos.length && <p className="website-helper">No uploaded photos available. Your website can use an elegant text-only header.</p>}<p className="website-hint">Choosing a cover does not make your gallery public. This phase saves a private selection only.</p></section>
      <section className="workspace-panel website-section"><h2><span>05</span>Public events</h2><p className="website-helper">Select which scheduled celebrations you may want to share publicly. Nothing is published by saving. Times use {timezone}.</p>
        {draft.selectedEventIds.filter(id => !editor.events.some(e => e.id === id)).map(id => <label className="website-event" key={id}><input type="checkbox" checked onChange={() => change({ ...draft, selectedEventIds: draft.selectedEventIds.filter(v => v !== id) })} /><span>Unavailable event · Uncheck to remove this selection</span></label>)}
        {editor.events.map(event => <label className="website-event" key={event.id}><input type="checkbox" checked={draft.selectedEventIds.includes(event.id)} onChange={e => change({ ...draft, selectedEventIds: e.target.checked ? [...draft.selectedEventIds, event.id] : draft.selectedEventIds.filter(id => id !== event.id) })} /><span><strong>{event.name}</strong><small>{eventDate(event.startsAt, timezone)} · {new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(event.startsAt))} · {event.venue.name}</small><small>{event.venue.address}</small></span></label>)}{!editor.events.length && <p className="website-helper">No eligible events available. Draft, cancelled and removed events cannot be selected.</p>}{fieldError("draft.selectedEventIds")}<p className="website-hint">When explicitly published in a later step, selected event details become visible to anyone with the website address. Household invitations and attendance remain private.</p></section>
      <section className="workspace-panel website-section"><h2><span>06</span>Public contact</h2><label className="website-event"><input type="checkbox" checked={!!draft.contact} onChange={e => change({ ...draft, contact: e.target.checked ? {} : undefined })} /><span>Include contact information for public inquiries</span></label>{draft.contact && <div className="website-contact">{([['name','Contact name'],['email','Public email'],['phone','Public phone']] as const).map(([key,label]) => <label key={key}>{label}<input type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} value={draft.contact?.[key] ?? ''} maxLength={key === 'email' ? 254 : key === 'phone' ? 40 : 200} onChange={e => change({ ...draft, contact: { ...draft.contact, [key]: e.target.value || undefined } })} {...attrs(`draft.contact.${key}`)} />{fieldError(`draft.contact.${key}`)}</label>)}{fieldError("draft.contact")}</div>}<p className="website-hint">These details will be visible to everyone if you publish them. Private family and vendor contacts are never copied automatically.</p></section>
    </fieldset>
    <footer className="website-actions">{!readOnly && editor.enabled && <button type="submit" className="button button-primary" disabled={pending || blocked}>{pending ? "Saving draft…" : uncertain ? "Retry saving" : "Save draft"}</button>}<Link href="/wedding/website/preview" className="button button-secondary" aria-disabled={pending}>Preview saved draft</Link><p>Preview shows your saved draft. Save your changes first.</p></footer>
  </form><dialog ref={dialog} className="wedding-dialog" aria-labelledby="website-discard-title"><h2 id="website-discard-title">Leave your unsaved changes?</h2><p>Your entries will be lost. The preview shows only your saved draft.{uncertain && " An earlier save may have succeeded; review the saved draft before making another change."}</p><div className="website-actions"><button className="button button-secondary" autoFocus onClick={() => { reloadRequested.current = false; dialog.current?.close(); }}>Keep editing</button><button className="button button-primary" onClick={() => { leaving.current = true; dialog.current?.close(); if (reloadRequested.current) window.location.reload(); else router.push(destination.current); }}>Review saved draft</button></div></dialog></>;
}
