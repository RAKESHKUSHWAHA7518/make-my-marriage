"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gallerySelectionError } from "./file-selection";
import { formatPhotoBytes, uploadOne, RequestError, type UploadItem } from "./upload-transport";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";

export function GuestUploadPanel({ audience, enabled, onSaved }: { audience: "guest" | "household"; enabled: boolean; onSaved: () => Promise<void> }) {
  const router = useRouter(), [queue, setQueue] = useState<UploadItem[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const panel = useRef<HTMLDialogElement>(null), discard = useRef<HTMLDialogElement>(null), lock = useRef(false), alive = useRef(false), urls = useRef(new Set<string>()), leaving = useRef(false), destination = useRef("/shared-gallery"), reloadRequested = useRef(false), closeOnly = useRef(false);
  const dirty = queue.some(photo => photo.status !== "Uploaded");
  useUnsavedNavigation({ dirty, pending: busy, leaving, destination, reloadRequested, dialog: discard });
  useEffect(() => { alive.current = true; const created = urls.current; return () => { alive.current = false; for (const url of created) URL.revokeObjectURL(url); }; }, []);
  function update(item: UploadItem, patch: Partial<UploadItem>) { Object.assign(item, patch); if (alive.current) setQueue(list => list.map(photo => photo.id === item.id ? { ...item } : photo)); }
  function choose(files: File[]) {
    if (busy || !enabled) return; const message = gallerySelectionError(files, queue.length); setError(message); if (message) return;
    setNotice(""); setQueue(list => [...list, ...files.map(file => { const src = URL.createObjectURL(file); urls.current.add(src); return { id: crypto.randomUUID(), key: crypto.randomUUID(), file, src, status: "Waiting", progress: 0, attempted: false }; })]);
  }
  function clear(items: UploadItem[]) { for (const item of items) { URL.revokeObjectURL(item.src); urls.current.delete(item.src); } setQueue(list => list.filter(item => !items.some(remove => remove.id === item.id))); }
  function close() { if (busy) return; if (dirty) { closeOnly.current = true; discard.current?.showModal(); } else panel.current?.close(); }
  async function run(items: UploadItem[], transfer = false) {
    if (lock.current || !enabled) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      for (const item of items) {
        if (!alive.current) break; if (item.status === "Uploaded" || item.blocked) continue;
        try { await uploadOne(item, path => `${path}?audience=${audience}`, update, transfer); }
        catch (cause) {
          const blocked = cause instanceof RequestError && [401,403,404,409,422].includes(cause.status);
          update(item, { status: blocked ? "Needs attention" : "Needs checking", blocked, error: cause instanceof Error ? cause.message : "We couldn’t confirm this upload." });
          if (cause instanceof RequestError && [401,403,404,409].includes(cause.status)) break;
        }
      }
      if (alive.current) { const saved = queue.filter(item => item.status === "Uploaded").length; setNotice(`${saved} ${saved === 1 ? "photo saved" : "photos saved"}${queue.some(item => item.status !== "Uploaded") ? ". Some photos need attention." : "."}`); await onSaved(); }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const saved = queue.filter(item => item.status === "Uploaded").length;
  return <><section className="guest-upload-callout"><div><span className="wedding-kicker">Add your moments</span><h2>Share your photos with the couple</h2><p>Verified photos appear automatically in this shared gallery.</p><small>JPEG, PNG and WebP · Up to 20 MB per photo</small></div>{enabled ? <button className="button button-primary" onClick={() => panel.current?.showModal()}>Upload photos</button> : <p>Photo uploads are currently turned off.</p>}</section>
    <dialog className="gallery-dialog guest-upload-dialog" ref={panel} aria-labelledby="guest-upload-title" onCancel={event => { event.preventDefault(); close(); }}><header><div><span className="wedding-kicker">Make My Marriage · Guest gallery</span><h2 id="guest-upload-title">Share your photos</h2></div><button className="gallery-icon-button" aria-label="Close upload panel" disabled={busy} onClick={close}>×</button></header><div className="gallery-dialog-body"><p>Add your moments to the wedding gallery. Photos appear only after verification.</p>{!enabled && <p className="wedding-notice">Photo uploads are currently turned off. Viewing remains available.</p>}<div className="gallery-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choose(Array.from(event.dataTransfer.files)); }}><span aria-hidden="true">▧</span><h3>Drag and drop photos here, or browse files</h3><input aria-label="Choose photos" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || !enabled} onChange={event => { choose(Array.from(event.target.files ?? [])); event.target.value = ""; }}/><p>JPEG, PNG and WebP · Up to 20 MB per photo · Up to 20 photos in the queue</p><small>HEIC, RAW formats, videos and documents are not supported.</small></div>{error && <p role="alert" className="event-form-error">{error}</p>}<div className="event-form-actions"><h3>Queue · {queue.length} photos</h3>{saved > 0 && <button disabled={busy} className="button button-secondary" onClick={() => clear(queue.filter(item => item.status === "Uploaded"))}>Clear uploaded photos</button>}</div>
      {queue.map(item => <article className="gallery-queue-row" key={item.id}><Image unoptimized src={item.src} width={72} height={72} alt="Selected photo"/><div><strong>{item.file.name}</strong><p>{formatPhotoBytes(item.file.size)} · <span role="status">{item.status}</span></p>{item.status === "Uploading" && <progress max={100} value={item.progress} aria-label={`Uploading ${item.file.name}`}/ >}{item.error && <p role="alert">{item.error}</p>}<div className="event-form-actions">{item.status !== "Waiting" && item.status !== "Uploaded" && !item.blocked && <button disabled={busy || !enabled} className="button button-secondary" onClick={() => run([item])}>{item.intent ? "Check upload status" : "Retry upload"}</button>}{item.intent && item.status === "Needs checking" && !item.blocked && <button disabled={busy || !enabled} className="button button-secondary" onClick={() => run([item], true)}>Retry transfer</button>}</div></div>{!item.attempted && <button className="gallery-icon-button" aria-label={`Remove ${item.file.name} from queue`} disabled={busy} onClick={() => clear([item])}>×</button>}</article>)}
      {notice && <p role="status" className="wedding-notice">{notice}</p>}<p className="guest-upload-privacy">No account required. Your filenames stay in this queue; verified photos appear in the shared gallery for the couple and guests.</p></div><footer><button className="button button-secondary" disabled={busy} onClick={close}>Back to gallery</button><button className="button button-primary" disabled={busy || !enabled || !queue.some(item => item.status !== "Uploaded" && !item.blocked)} onClick={() => run(queue)}>{busy ? "Working…" : "Upload / check photos"}</button><small>Keep this page open while uploads finish. Unconfirmed photos may not have been saved.</small></footer></dialog>
    <dialog ref={discard} onCancel={() => { closeOnly.current = false; }} className="gallery-dialog gallery-confirm" aria-labelledby="guest-discard-title"><h2 id="guest-discard-title">Leave unfinished uploads?</h2><p>Unfinished selections will be removed from this device’s queue. Saved photos remain in the gallery. An interrupted upload may still need checking.</p><div className="event-form-actions"><button className="button button-secondary" autoFocus onClick={() => { closeOnly.current = false; discard.current?.close(); }}>Keep checking</button><button className="button button-primary" onClick={() => { clear(queue); discard.current?.close(); panel.current?.close(); if (!closeOnly.current) { leaving.current = true; if (reloadRequested.current) window.location.reload(); else router.push(destination.current); } closeOnly.current = false; }}>Discard queue and leave</button></div></dialog>
  </>;
}
