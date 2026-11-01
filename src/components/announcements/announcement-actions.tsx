"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnnouncementView } from "@/modules/announcements/service";
export function AnnouncementActions({ weddingId, item }: { weddingId: string; item: AnnouncementView }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), submission = useRef<{ body: string; key: string; remove: boolean } | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false), [message, setMessage] = useState("");
  async function mutate(remove: boolean) {
    if (locked.current || blocked) return;
    submission.current ??= { body: JSON.stringify({ expectedVersion: item.version, ...(!remove ? { pinned: !item.pinned } : {}) }), key: crypto.randomUUID(), remove };
    const saved = submission.current; locked.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/announcements/${item.id}${saved.remove ? "/remove" : ""}`, { method: saved.remove ? "POST" : "PATCH", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key }, body: saved.body, signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && result.data?.id === item.id) { setBlocked(true); setUncertain(false); dialog.current?.close(); if (saved.remove) router.replace("/wedding/announcements"); router.refresh(); return; }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error("Unknown outcome");
      submission.current = null; setUncertain(false); setBlocked(true); setMessage(result.error?.message ?? "Reload the current announcement before continuing.");
    } catch { setUncertain(true); setMessage("We couldn’t confirm whether your changes were saved. Retry the same request to check."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <><div className="announcement-actions" aria-busy={busy}>
    {!uncertain && !blocked && <><button type="button" className="announcement-text-button" disabled={busy} onClick={() => mutate(false)}>{item.pinned ? "Unpin" : "Pin"}</button>{!busy && <Link href={`/wedding/announcements/${item.id}/edit`}>Edit</Link>}<button type="button" className="announcement-text-button announcement-remove" disabled={busy} onClick={() => dialog.current?.showModal()}>Remove</button></>}
    {busy && <span role="status">Saving changes…</span>}{uncertain && !busy && <button type="button" className="button button-secondary" onClick={() => mutate(submission.current!.remove)}>Retry same request</button>}{blocked && <button type="button" className="button button-secondary" onClick={() => window.location.reload()}>Reload current status</button>}
  </div>{message && <p className="wedding-notice" role="status">{message}</p>}<dialog ref={dialog} className="wedding-dialog" aria-labelledby={`remove-announcement-${item.id}`} onCancel={e => { if (busy || uncertain) e.preventDefault(); }}><h2 id={`remove-announcement-${item.id}`}>Remove this announcement?</h2><p>It will no longer appear in your family’s announcement list.</p>{message && <p role="status">{message}</p>}<div className="announcement-actions"><button type="button" className="button button-secondary" disabled={busy || uncertain} onClick={() => dialog.current?.close()}>Keep announcement</button><button type="button" className="button button-primary" disabled={busy || blocked} onClick={() => mutate(true)}>{busy ? "Removing…" : uncertain ? "Retry same request" : "Remove announcement"}</button>{blocked && <button type="button" className="button button-secondary" onClick={() => window.location.reload()}>Reload current status</button>}</div></dialog></>;
}
