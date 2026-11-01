"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function PublicationAction({ weddingId, action, payload, disabled = false }: { weddingId: string; action: "publish" | "unpublish"; payload: { expectedDraftVersion?: number; expectedPublishedRevision: number; expectedReviewHash?: string }; disabled?: boolean }) {
  const router = useRouter(), submission = useRef<{ body: string; key: string } | null>(null), inFlight = useRef(false);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false), [message, setMessage] = useState("");
  async function submit() {
    if (disabled || blocked || inFlight.current || (!confirmed && !submission.current)) return;
    submission.current ??= { body: JSON.stringify(payload), key: crypto.randomUUID() };
    const saved = submission.current; inFlight.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/public-page/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key }, body: saved.body, signal: AbortSignal.timeout(55000) });
      const result = await response.json();
      if (response.ok) {
        if (!result.data || !Number.isInteger(result.data.publishedRevision) || result.data.publishedRevision <= payload.expectedPublishedRevision) throw Error("Unconfirmed outcome");
        submission.current = null; setUncertain(false); setBlocked(true); setMessage("Request confirmed. Opening the current website status…"); router.push("/wedding/website/manage"); router.refresh(); return;
      }
      if (response.status === 429 || response.status >= 500) { setUncertain(true); setMessage("The outcome is not confirmed. Retry this same request to check safely."); return; }
      submission.current = null; setUncertain(false); setBlocked(true); setMessage(result.error?.message ?? "Review the current website status before trying again.");
    } catch { setUncertain(true); setMessage("We could not confirm the outcome. Retry the same request; do not start a second publication."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="workspace-panel website-publish-consent" aria-busy={busy}><label className="website-event"><input type="checkbox" checked={confirmed} disabled={disabled || busy || uncertain || blocked} onChange={e => setConfirmed(e.target.checked)} /><span>{action === "publish" ? "I confirm that these saved details and the selected cover photo are intended for public viewing." : "I want to take this wedding website offline."}</span></label><p className="website-helper">{action === "publish" ? "Anyone with the website address can view the published information. Private invitation and gallery access are separate." : "New requests to the website and its public cover will be blocked. Copies already downloaded cannot be recalled. Your saved draft remains available."}</p><div className="website-actions"><button type="button" className="button button-primary" disabled={disabled || busy || blocked || (!confirmed && !uncertain)} onClick={submit}>{busy ? action === "publish" ? "Publishing…" : "Unpublishing…" : uncertain ? "Retry same request" : action === "publish" ? "Publish website" : "Unpublish website"}</button>{blocked && <button type="button" className="button button-secondary" onClick={() => window.location.reload()}>Reload current status</button>}</div>{message && <p className="wedding-notice" role="status">{message}</p>}</section>;
}
