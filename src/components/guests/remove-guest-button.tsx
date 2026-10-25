"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function RemoveGuestButton({ weddingId, id, name, version }: { weddingId: string; id: string; name: string; version: number }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), key = useRef<string | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [blocked, setBlocked] = useState(false);
  async function remove() {
    if (locked.current || blocked) return;
    locked.current = true; setPending(true); setError(""); key.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/households/${id}/remove`, { method: "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": key.current }, body: JSON.stringify({ expectedVersion: version }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && result.data?.id === id && result.data?.status === "removed") { dialog.current?.close(); router.replace("/wedding/guests?removed=1"); router.refresh(); return; }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      setError(result.error?.message ?? "Could not remove this group."); setBlocked(true);
    } catch { setError("We could not confirm removal. Retry the same request safely, or reload to check the saved state. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  return <><button className="button guest-remove" type="button" onClick={() => dialog.current?.showModal()}>Remove guest group</button><dialog ref={dialog} className="wedding-dialog guest-remove-dialog" aria-labelledby="remove-guest-title" onCancel={e => { if (locked.current) e.preventDefault(); }}><h2 id="remove-guest-title">Remove this guest group?</h2><strong>{name}</strong><p>Removed from active lists and maximum invited people totals. Planning history is preserved. Related events and accounts will not be deleted.</p>{error && <p className="event-form-error" role="alert">{error}</p>}<div className="event-form-actions"><button className="button button-secondary" type="button" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button>{blocked ? <button className="button button-primary" type="button" onClick={() => window.location.reload()}>Reload latest details</button> : <button className="button guest-remove" type="button" disabled={pending} onClick={remove}>{pending ? "Removing…" : error ? "Retry removal" : "Remove guest group"}</button>}</div></dialog></>;
}
