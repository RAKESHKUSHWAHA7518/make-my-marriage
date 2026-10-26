"use client";
import { useRef, useState } from "react";
export function InvitationSharing({ weddingId, householdId, archived, eligibleCount }: { weddingId: string; householdId: string; archived: boolean; eligibleCount: number }) {
  const dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), submission = useRef<{ key: string; body: string } | null>(null);
  const [link, setLink] = useState<{ url: string; linkVersion: number } | null>(null), [pending, setPending] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  async function load(rotate = false) {
    if (locked.current || (rotate && (archived || blocked))) return;
    if (rotate && !submission.current) { if (!link) return; submission.current = { key: crypto.randomUUID(), body: JSON.stringify({ expectedLinkVersion: link.linkVersion }) }; }
    locked.current = true; setPending(true); setError(""); setCopied(false);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/households/${householdId}/invitation-link${rotate ? "/rotate" : ""}`, { method: "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", ...(rotate ? { "Idempotency-Key": submission.current!.key } : {}) }, body: rotate ? submission.current!.body : undefined, signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && typeof result.data?.url === "string" && Number.isInteger(result.data.linkVersion)) {
        setLink(result.data); setUncertain(false); setBlocked(false); submission.current = null; dialog.current?.close(); return;
      }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      if (rotate) { setBlocked(true); setUncertain(true); }
      setError(result.error?.message ?? "Could not load the invitation link. Please retry.");
    } catch { if (rotate) setUncertain(true); setError(rotate ? "We couldn’t confirm whether the link was replaced. Retry the same replacement, or reload the link before sharing. If rate-limited, wait before retrying." : "We couldn’t load the invitation link. Please retry."); }
    finally { locked.current = false; setPending(false); }
  }
  async function copy() {
    if (!link || uncertain || pending) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); setError(""); }
    catch { setCopied(false); setError("Copying was unavailable. Select and copy the link below manually."); }
  }
  return <section className="workspace-panel invitation-sharing"><h2>Private invitation link</h2><p>Share this link privately with this household. Anyone with the link can view its invitation and update its response.</p>
    {!eligibleCount && <p className="wedding-notice">This household’s events are still being planned. Schedule an invited event before expecting a response.</p>}
    {archived && <p>This wedding is archived. Guest responses are read-only; only an existing link can be copied.</p>}
    {error && <p role="alert" className="event-form-error">{error}</p>}
    {link && !uncertain && <label>Invitation link<input className="invitation-link-field" readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} /></label>}
    <div className="event-form-actions">
      {!link || uncertain ? <button className="button button-secondary" type="button" disabled={pending} onClick={() => load()}>{pending ? "Loading…" : uncertain ? "Reload invitation link" : "Load invitation link"}</button> : <button type="button" className="button button-primary" disabled={pending} onClick={copy}>Copy invitation link</button>}
      {link && !archived && <button type="button" className="button button-secondary" disabled={pending} onClick={() => dialog.current?.showModal()}>Replace invitation link</button>}
    </div>{copied && <p role="status">Invitation link copied.</p>}<small>Copying or replacing a link does not send an email or WhatsApp message.</small>
    <dialog ref={dialog} className="wedding-dialog event-discard-dialog" aria-labelledby="replace-household-link" onCancel={(e) => { if (locked.current) e.preventDefault(); }}><h2 id="replace-household-link">Replace this invitation link?</h2><p>The old link will stop working. Share the new link with this household after replacing it.</p>{error && <p role="alert">{error}</p>}<div className="event-form-actions"><button type="button" className="button button-secondary" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>{uncertain ? "Close" : "Keep current link"}</button>{blocked ? <button className="button button-primary" type="button" onClick={() => { dialog.current?.close(); void load(); }}>Reload details</button> : <button type="button" className="button button-primary" disabled={pending} onClick={() => load(true)}>{pending ? "Replacing…" : uncertain ? "Retry replacement" : "Replace link"}</button>}</div></dialog>
  </section>;
}
