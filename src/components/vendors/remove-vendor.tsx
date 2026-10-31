"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { VendorView } from "@/modules/vendors/service";

export function RemoveVendor({ weddingId, vendor }: { weddingId: string; vendor: VendorView }) {
  const dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), submission = useRef<{ key: string; version: number } | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [blocked, setBlocked] = useState(false), [uncertain, setUncertain] = useState(false);
  async function remove() {
    if (locked.current || blocked) return;
    locked.current = true; setPending(true); setError(""); const saved = submission.current ??= { key: crypto.randomUUID(), version: vendor.version };
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/vendors/${vendor.id}/remove`, { method: "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key }, body: JSON.stringify({ expectedVersion: saved.version }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && result.data?.id === vendor.id && result.data.status === "removed") { dialog.current?.close(); window.location.replace("/wedding/vendors"); return; }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      setError(result.error?.message ?? "This vendor could not be removed."); setBlocked(true); setUncertain(false);
    } catch { setUncertain(true); setError("We couldn’t confirm removal. Retry the same request to check. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  return <><button type="button" className="button button-secondary" onClick={() => dialog.current?.showModal()}>Remove vendor</button><dialog ref={dialog} className="wedding-dialog wedding-card" aria-labelledby="remove-vendor-title" onCancel={e => { if (pending) e.preventDefault(); }}><h2 id="remove-vendor-title">Remove this vendor?</h2><p><strong>{vendor.name}</strong></p><p>This vendor will be removed from your active planning list. Existing expense records and their amounts will stay unchanged.</p>{error && <p className="event-form-error" role="alert">{error}</p>}{blocked && <Link href="/wedding/vendors">Review vendor list</Link>}<div className="event-form-actions"><button className="button button-secondary" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>{uncertain ? "Close and check vendors" : "Keep vendor"}</button><button className="button button-primary" disabled={pending || blocked} onClick={remove}>{pending ? "Removing vendor…" : uncertain ? "Retry removal" : "Remove vendor"}</button></div></dialog></>;
}
