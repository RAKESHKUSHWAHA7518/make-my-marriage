"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DownloadCard } from "@/components/designs/download-card";
import type { whatsappPreview } from "@/modules/guest-access/whatsapp";

type Preview = Awaited<ReturnType<typeof whatsappPreview>>;

class SharingError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) { super(message); }
}

async function request<T>(url: string, data: object, signal = AbortSignal.timeout(15000)): Promise<T> {
  const response = await fetch(url, {
    method: "POST", cache: "no-store", signal,
    headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.data) throw new SharingError(result.error?.message ?? "Could not prepare sharing. Please retry.", result.error?.code, response.status);
  return result.data;
}

export function WhatsappSharing({ weddingId, householdId }: { weddingId: string; householdId: string }) {
  const endpoint = `/api/v1/weddings/${weddingId}/invitations/whatsapp-preview`;
  const back = `/wedding/guests/${householdId}`;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<SharingError | null>(null);
  const [busy, setBusy] = useState(true);
  const [opened, setOpened] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState<"message" | "url">();
  const lock = useRef(false);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const linkField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    request<Preview>(endpoint, { householdId }, AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]))
      .then(value => { if (!abort.signal.aborted) setPreview(value); })
      .catch(error => { if (!abort.signal.aborted) setError(error instanceof SharingError ? error : new SharingError("Could not prepare sharing. Please retry.")); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [endpoint, householdId]);

  async function perform(action: "review" | "message" | "url" | "open" | "mark" | "download"): Promise<boolean> {
    if (lock.current || busy || (!preview && action !== "review")) return false;
    const popup = action === "open" ? window.open("about:blank", "_blank") : null;
    if (action === "open" && !popup) {
      setNotice("The browser blocked the WhatsApp window. Copy the message to share it manually.");
      return false;
    }
    if (popup) popup.opener = null;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    setManualCopy(undefined);
    let handedOff = false;
    try {
      if (action === "mark" && preview) {
        const result = await request<{ markedAt: string }>(endpoint + "?action=mark-shared", { householdId, expectedReview: preview.review });
        setPreview({ ...preview, markedAt: result.markedAt });
        return true;
      }
      const data = await request<Preview>(endpoint, {
        householdId,
        ...(action !== "review" && preview ? { expectedReview: preview.review } : {}),
      });
      setPreview(data);
      if (action === "open" && popup) {
        if (popup.closed) throw new SharingError("The WhatsApp window closed. Try again or copy the message.");
        popup.location.replace(`https://wa.me/?${new URLSearchParams({ text: data.message }).toString().replaceAll("+", "%20")}`);
        handedOff = true;
        setOpened(data.review);
      } else if (action === "message" || action === "url") {
        setCopied(data.review);
        try {
          await navigator.clipboard.writeText(data[action]);
          setNotice(action === "message" ? "Message copied." : "Private invitation link copied.");
        } catch {
          setManualCopy(action);
          setNotice("Automatic copying is unavailable. Select and copy the text below.");
          const field = action === "message" ? messageField.current : linkField.current;
          field?.focus();
          field?.select();
        }
      }
      return true;
    } catch (error) {
      const failure = error instanceof SharingError ? error : new SharingError("Could not confirm the request. Please retry.");
      setError(failure);
      if (failure.status && [401, 403, 404, 409, 422].includes(failure.status)) setPreview(null);
      return false;
    } finally {
      if (!handedOff) popup?.close();
      lock.current = false;
      setBusy(false);
    }
  }

  if (!preview) {
    return (
      <section className="workspace-panel">
        {busy ? <p role="status">Preparing your invitation message…</p> : <p role="alert">{error?.message}</p>}
        <div className="design-actions">
          {!busy && error?.status !== 404 && error?.code !== "WEDDING_ARCHIVED" && <button type="button" className="button button-primary" onClick={() => void perform("review")}>{error?.code === "REVIEW_CHANGED" ? "Review again" : "Retry preview"}</button>}
          {error?.code === "CARD_UNAVAILABLE" && <Link className="button button-secondary" href={`${back}/card`}>Change card selection</Link>}
          <Link className="button button-secondary" href={error?.status === 404 ? "/wedding/guests" : back}>{error?.status === 404 ? "Back to Guests & RSVP" : "Back to household"}</Link>
        </div>
      </section>
    );
  }

  const openedHere = opened === preview.review;
  return (
    <div className="design-editor-grid">
      <section className="workspace-panel">
        <h2>{preview.household}</h2>
        <dl className="workspace-facts">
          <div><dt>Representative</dt><dd>{preview.representative}</dd></div>
          <div><dt>Published card</dt><dd>{preview.card ? `${preview.card.content.name} · Version ${preview.card.revision}` : "No card selected"}</dd></div>
        </dl>
        <h3>Eligible invited events</h3>
        <ul className="publication-events">{preview.events.map(event => <li key={event.id}>{event.name} · {event.time}</li>)}</ul>
        <p>You’ll choose the recipient and send the message in WhatsApp.</p>
        <div className="design-actions">
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void perform("open")}>{openedHere ? "Reopen WhatsApp" : "Open WhatsApp"}</button>
          <Link className="button button-secondary" href={back}>Back to household</Link>
        </div>
        {openedHere && <p role="status">WhatsApp opened. Finish sending in WhatsApp.</p>}
        {preview.markedAt
          ? <p role="status">Marked as shared by organizer</p>
          : (openedHere || copied === preview.review) && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void perform("mark")}>Mark as shared</button>}
        {preview.card && <div>
          <DownloadCard content={preview.card.content} available={!busy} label="Download card (PNG)" beforeDownload={() => perform("download")} />
          <p>Attach the downloaded card in WhatsApp if you’d like.</p>
        </div>}
      </section>
      <section className="design-preview-panel">
        <h2>Prepared message</h2>
        <label className="whatsapp-field">Invitation message
          <textarea ref={messageField} rows={12} readOnly value={preview.message} onFocus={event => { if (manualCopy === "message") event.currentTarget.select(); }} />
        </label>
        <label className="whatsapp-field">Private invitation link
          <input ref={linkField} className="invitation-link-field" readOnly value={preview.url} onFocus={event => event.currentTarget.select()} />
        </label>
        <div className="design-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => void perform("message")}>Copy message</button>
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => void perform("url")}>Copy link</button>
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error.message}</p>}
      </section>
    </div>
  );
}
