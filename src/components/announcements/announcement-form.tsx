"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { createAnnouncementSchema } from "@/modules/announcements/schema";
import type { AnnouncementView } from "@/modules/announcements/service";
export function AnnouncementForm({ weddingId, initial }: { weddingId: string; initial?: AnnouncementView }) {
  const router = useRouter(), form = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), leaving = useRef(false), destination = useRef("/wedding/announcements"), reloadRequested = useRef(false);
  const submission = useRef<{ body: string; key: string } | null>(null);
  const [title, setTitle] = useState(initial?.title ?? ""), [message, setMessage] = useState(initial?.body ?? ""), [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false), [error, setError] = useState(""), [fields, setFields] = useState<Record<string, string>>({});
  const dirty = title !== (initial?.title ?? "") || message !== (initial?.body ?? "") || pinned !== (initial?.pinned ?? false);
  useUnsavedNavigation({ dirty: dirty || uncertain, pending, leaving, destination, reloadRequested, dialog });
  const focusError = () => requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  async function save(e: FormEvent) {
    e.preventDefault(); if (locked.current || blocked || (initial && !dirty && !submission.current)) return;
    setError(""); setFields({});
    if (!submission.current) {
      const parsed = createAnnouncementSchema.safeParse({ title, body: message, pinned });
      if (!parsed.success) { setFields(Object.fromEntries(parsed.error.issues.map(i => [i.path.join("."), i.message]))); setError("Please check the highlighted fields."); focusError(); return; }
      submission.current = { body: JSON.stringify({ ...parsed.data, ...(initial ? { expectedVersion: initial.version } : {}) }), key: crypto.randomUUID() };
    }
    const saved = submission.current; locked.current = true; setPending(true);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/announcements${initial ? `/${initial.id}` : ""}`, { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key }, body: saved.body, signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && /^[a-f0-9]{24}$/.test(result.data?.id) && (!initial || result.data.id === initial.id)) { leaving.current = true; setUncertain(false); setBlocked(true); router.replace(result.data.removed ? "/wedding/announcements" : `/wedding/announcements/${result.data.id}`); router.refresh(); return; }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error("Unknown outcome");
      submission.current = null; setUncertain(false); setError(result.error?.message ?? "Your changes could not be saved.");
      if ([401, 403, 404, 409].includes(response.status)) setBlocked(true);
      setFields(Object.fromEntries((result.error?.fields ?? []).map((i: { path: string; message: string }) => [i.path, i.message]))); focusError();
    } catch { setUncertain(true); setError("We couldn’t confirm whether your changes were saved. Retry to check. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  const field = (name: string) => ({ "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `announcement-${name}-error` : undefined });
  return <><form ref={form} onSubmit={save} className="workspace-panel announcement-form" noValidate aria-busy={pending}>
    {initial && <p className="announcement-privacy">Originally posted by {initial.author.name}. The original author is preserved.</p>}
    {error && <div className="event-form-error" role="alert"><p>{error}</p>{blocked && <button type="button" className="button button-secondary" onClick={() => { reloadRequested.current = true; dialog.current?.showModal(); }}>Reload latest</button>}</div>}
    <fieldset disabled={pending || uncertain || blocked}><label htmlFor="announcement-title">Title <b>*</b></label><input id="announcement-title" name="title" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required placeholder="e.g. Planning call this Sunday" {...field("title")} />{fields.title && <small id="announcement-title-error" className="event-field-error">{fields.title}</small>}
      <label htmlFor="announcement-body">Message <b>*</b><small>Plain text only</small></label><textarea id="announcement-body" name="body" value={message} onChange={e => setMessage(e.target.value)} maxLength={10000} rows={9} required placeholder="Write an update for your planning family…" {...field("body")} />{fields.body && <small id="announcement-body-error" className="event-field-error">{fields.body}</small>}
      <label className="announcement-pin-choice"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /><span>Pin this announcement<small>Pinned announcements appear first.</small></span></label>
    </fieldset><p className="announcement-privacy">Only your wedding’s planning family can see this announcement.</p>
    <div className="announcement-actions"><button type="submit" className="button button-primary" disabled={pending || blocked || (!!initial && !dirty && !uncertain)}>{pending ? initial ? "Saving changes…" : "Posting announcement…" : uncertain ? "Retry same save" : initial ? "Save changes" : "Post announcement"}</button><Link className="button button-secondary" href={initial ? `/wedding/announcements/${initial.id}` : "/wedding/announcements"}>Cancel</Link></div>
    {blocked && <p className="website-helper">Review the latest announcement or sign in again before making changes. Your text stays here until you confirm reloading.</p>}
  </form><dialog ref={dialog} className="wedding-dialog" aria-labelledby="announcement-discard-title"><h2 id="announcement-discard-title">Discard your changes?</h2><p>{uncertain ? "The previous request may already have saved. Leaving discards your local text and retry controls; check the latest announcement before trying again." : "Your unsaved changes will be lost."}</p><div className="announcement-actions"><button type="button" className="button button-secondary" onClick={() => dialog.current?.close()}>Keep editing</button><button type="button" className="button button-primary" onClick={() => { leaving.current = true; if (reloadRequested.current) window.location.reload(); else { router.push(destination.current); router.refresh(); } }}>Discard changes</button></div></dialog></>;
}
