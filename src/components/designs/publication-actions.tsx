"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Retain exact body/key on unknown outcomes, including rate-limited retries. */
export function PublicationAction({ url, payload, destination, label, disabled = false, confirmation }: { url: string; payload: object; destination: string; label: string; disabled?: boolean; confirmation?: string }) {
  const router = useRouter(), pending = useRef<{ body: string; key: string } | null>(null), lock = useRef(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false), [message, setMessage] = useState(""), [confirmed, setConfirmed] = useState(false);
  async function submit() {
    if (lock.current || disabled || blocked || (confirmation && !confirmed)) return;
    lock.current = true; setBusy(true); setMessage("");
    const submission = pending.current ?? { body: JSON.stringify(payload), key: crypto.randomUUID() }; pending.current = submission;
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": submission.key }, body: submission.body, signal: AbortSignal.timeout(25000) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) throw Error();
        setMessage(result.error?.message ?? "Unable to save. Reload and review before trying again."); setBlocked(true); return;
      }
      if (destination.includes("{version}")) {
        if (!/^[a-f0-9]{24}$/.test(result.data?.designVersionId ?? "")) throw Error();
        router.replace(destination.replace("{version}", result.data.designVersionId));
      } else {
        if (result.data?.saved !== true) throw Error();
        router.replace(destination);
      }
      router.refresh();
    } catch { setUncertain(true); setMessage("We couldn’t confirm whether this was saved. Retry to check the same submission."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="publication-action">{confirmation && <label className="publication-confirm"><input type="checkbox" checked={confirmed} disabled={busy || uncertain || blocked || disabled} onChange={e => setConfirmed(e.target.checked)} />{confirmation}</label>}{message && <p role="alert" className="wedding-notice">{message}</p>}<button type="button" className="button button-primary" disabled={busy || disabled || blocked || (!!confirmation && !confirmed)} onClick={submit}>{busy ? "Saving…" : uncertain ? "Retry same submission" : label}</button>{blocked && <button type="button" className="button button-secondary" onClick={() => window.location.reload()}>Reload and review</button>}</div>;
}
