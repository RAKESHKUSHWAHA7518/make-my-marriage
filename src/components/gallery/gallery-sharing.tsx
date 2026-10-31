"use client";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import type { GallerySettings } from "@/modules/media/gallery-access";

class SaveError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request(url: string, method = "GET", payload?: unknown, key?: string) {
  const response = await fetch(url, { method, cache: "no-store", headers: { ...(method !== "GET" ? { "Content-Type": "application/json", "X-MMM-CSRF": "1" } : {}), ...(key ? { "Idempotency-Key": key } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(20000) });
  const result = await response.json(); if (!response.ok) throw new SaveError(result.error?.message ?? "Please retry.", response.status); return result.data;
}
type Submission = { action: "settings" | "rotate"; payload: { expectedVersion: number; isEnabled?: boolean; guestUploadsEnabled?: boolean; expectedTokenVersion?: number }; key: string };
export function GallerySharing({ initial, weddingId, role }: { initial: GallerySettings; weddingId: string; role: "ADMIN" | "MANAGER" }) {
  const [data, setData] = useState(initial), [url, setUrl] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [confirm, setConfirm] = useState<"enable" | "disable" | "uploads-enable" | "uploads-disable" | "rotate" | null>(null);
  const pending = useRef<Submission | null>(null), lock = useRef(false), dialog = useRef<HTMLDialogElement>(null), base = `/api/v1/weddings/${weddingId}/gallery`;
  const qr = useMemo(() => { if (!url) return ""; const code = qrcode(0, "M"); code.addData(url); code.make(); return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code.createSvgTag({ cellSize: 4, margin: 16, scalable: true }))}`; }, [url]);
  const archived = data.weddingState !== "active";
  async function reload() {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setUrl("");
    try { const latest = await request(`${base}/settings`); setData(latest); pending.current = null; setUncertain(false); if (latest.isEnabled) setUrl((await request(`${base}/share-link`, "POST")).url); }
    catch (e) { setError(e instanceof Error ? e.message : "Please retry."); }
    finally { lock.current = false; setBusy(false); }
  }
  function ask(action: "enable" | "disable" | "uploads-enable" | "uploads-disable" | "rotate") { if (lock.current || uncertain) return; setError(""); setNotice(""); setConfirm(action); dialog.current?.showModal(); }
  async function save() {
    if (lock.current || !confirm) return;
    if (!pending.current) pending.current = { action: confirm === "rotate" ? "rotate" : "settings", payload: { expectedVersion: data.version, ...(confirm === "rotate" ? { expectedTokenVersion: data.tokenVersion } : confirm.startsWith("uploads-") ? { guestUploadsEnabled: confirm === "uploads-enable" } : { isEnabled: confirm === "enable" }) }, key: crypto.randomUUID() };
    const submission = pending.current; lock.current = true; setBusy(true); setError(""); setUrl("");
    try {
      const result = await request(`${base}/${submission.action}`, submission.action === "settings" ? "PATCH" : "POST", submission.payload, submission.key);
      setData(result.settings); pending.current = null; setUncertain(false); dialog.current?.close(); setConfirm(null); setNotice("Gallery sharing saved.");
      if (result.settings.isEnabled) { if (result.url) setUrl(result.url); else { try { setUrl((await request(`${base}/share-link`, "POST")).url); } catch { setError("Sharing was saved. Reload sharing details to retrieve the current link."); } } }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
      const retain = !(e instanceof SaveError) || e.status === 429 || e.status >= 500;
      setUncertain(retain); if (!retain) pending.current = null;
    } finally { lock.current = false; setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(url); setNotice("Gallery link copied."); } catch { setError("Copying is unavailable. Select and copy the link below."); } }
  return <><Link href="/wedding/gallery">← Back to gallery</Link><header className="gallery-heading"><div><span className="wedding-kicker">Your family memories</span><h1>Gallery sharing &amp; guest uploads</h1><p>Choose when to share your photos with your guests.</p></div></header>
    <section className="wedding-card gallery-sharing"><h2>Guest access · {data.isEnabled ? "Enabled" : "Disabled"}</h2><p>Anyone with this link can view your gallery, including people it is forwarded to.</p><p>Enabling access shares all saved gallery photos and future additions. Your public wedding website stays unchanged.</p>
      {archived && <p className="wedding-notice">This wedding is archived. Existing viewing can continue. Only an administrator can disable sharing or replace its link.</p>}
      <div className="event-form-actions">{!archived && !data.isEnabled && <button className="button button-primary" disabled={busy || uncertain} onClick={() => ask("enable")}>Enable guest viewing</button>}{data.isEnabled && (!archived || role === "ADMIN") && <button className="button button-secondary" disabled={busy || uncertain} onClick={() => ask("disable")}>Disable guest viewing</button>}<button className="button button-secondary" disabled={busy} onClick={reload}>{busy ? "Loading…" : data.isEnabled && !url ? "Load link and QR" : "Reload sharing details"}</button></div>
      {error && <p role="alert" className="wedding-notice">{error}</p>}{notice && <p role="status">{notice}</p>}
      {data.isEnabled && url && !uncertain && <div className="gallery-share-content"><div><h2>Your private gallery link</h2><label>Gallery link<input className="gallery-share-url" value={url} readOnly onFocus={e => e.currentTarget.select()}/></label><div className="event-form-actions"><button className="button button-primary" disabled={busy} onClick={copy}>Copy link</button><a className="button button-secondary" href={qr} download="wedding-gallery-qr.svg">Download QR</a></div><p>Photographers can use this same link. Copying it sends no email or WhatsApp message.</p></div><Image src={qr} width={200} height={200} unoptimized alt="QR code for this private gallery link"/></div>}
      {role === "ADMIN" && <div className="gallery-sharing-danger"><h2>Replace gallery link</h2><p>The old link, printed QR codes and existing gallery sessions will stop working. Share the new link afterwards.</p><button className="button button-secondary" disabled={busy || uncertain} onClick={() => ask("rotate")}>Replace gallery link</button></div>}
      <section className="gallery-upload-setting"><div><span className="wedding-kicker">Guest photo collection</span><h2>Allow guests to upload photos</h2><p>Anyone with your gallery link can upload photos when this is enabled, including people the link is forwarded to.</p></div><button type="button" role="switch" aria-checked={data.guestUploadsEnabled} aria-label="Allow guests to upload photos" className="gallery-switch" disabled={busy || uncertain || !data.isEnabled || (archived && (role !== "ADMIN" || !data.guestUploadsEnabled))} onClick={() => ask(data.guestUploadsEnabled ? "uploads-disable" : "uploads-enable")}><span/></button><div className="gallery-privacy"><p>Turning uploads off keeps gallery viewing available.</p><p>Photographers use the same link and permissions. Photos pass automatic verification before appearing.</p>{!data.isEnabled && <p>Enable gallery viewing first. Guest uploads default to off.</p>}</div></section>
    </section>
    <dialog ref={dialog} className="gallery-dialog gallery-confirm" aria-labelledby="gallery-share-confirm" onCancel={e => { if (busy) e.preventDefault(); }}><h2 id="gallery-share-confirm">{confirm === "uploads-enable" ? "Allow guest photo uploads?" : confirm === "uploads-disable" ? "Turn guest uploads off?" : confirm === "enable" ? "Share your gallery with guests?" : confirm === "disable" ? "Disable guest viewing?" : "Replace gallery link?"}</h2><p>{confirm === "uploads-enable" ? "Anyone holding your gallery link can upload photos. Verified photos appear automatically for the couple and guests. Photographers use this same access." : confirm === "uploads-disable" ? "Guests can still view the gallery, but new and unfinished uploads cannot be saved while uploads are off." : confirm === "enable" ? "Anyone holding the link can view all saved gallery photos and future additions. You can disable access later." : confirm === "disable" ? "Shared links will stop opening the gallery. Previously downloaded images cannot be recalled." : "Old links, printed QR codes and existing shared-gallery sessions will stop working. Household invitations remain separate."}</p>{error && <p role="alert">{error}</p>}<div className="event-form-actions"><button className="button button-secondary" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>{uncertain ? "Close" : "Cancel"}</button><button className="button button-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : uncertain ? "Retry same save" : "Confirm"}</button></div></dialog>
  </>;
}
