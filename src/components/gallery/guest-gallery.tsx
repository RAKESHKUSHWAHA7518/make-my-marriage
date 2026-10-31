"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { GuestUploadPanel } from "./guest-upload-panel";
import type { GuestGalleryData } from "@/modules/media/gallery-access";

export function GuestGallery({ audience }: { audience: "guest" | "household" }) {
  const [data, setData] = useState<GuestGalleryData | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true), [selected, setSelected] = useState<string | null>(null), [failed, setFailed] = useState<string[]>([]), [attempt, setAttempt] = useState(0), [viewerFailed, setViewerFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false), alive = useRef(false), latest = useRef<GuestGalleryData | null>(null);
  async function load(more = false) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const cursor = more ? latest.current?.nextCursor : null;
      const response = await fetch(`/api/v1/gallery?audience=${audience}${cursor ? `&cursor=${cursor}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const result = await response.json(); if (!alive.current) return;
      if (!response.ok) { if (response.status === 404) { setData(null); latest.current = null; setSelected(null); dialog.current?.close(); } throw Error(response.status === 404 ? "This gallery is unavailable. Please contact the family who shared the link." : "We couldn’t load the gallery. Please retry."); }
      const next: GuestGalleryData = result.data;
      if (more && latest.current) next.photos = [...latest.current.photos, ...next.photos.filter(p => !latest.current!.photos.some(old => old.id === p.id))];
      latest.current = next; setData(next);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Please retry."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const loadRef = useRef(load); useEffect(() => { loadRef.current = load; });
  useEffect(() => { alive.current = true; void loadRef.current(); const refresh = () => { if (document.visibilityState === "visible") void loadRef.current(); }; window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh); return () => { alive.current = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); }; }, []);
  const index = data?.photos.findIndex(p => p.id === selected) ?? -1;
  function open(id: string) { setSelected(id); setViewerFailed(false); setAttempt(0); dialog.current?.showModal(); }
  function move(delta: number) { const photo = data?.photos[index + delta]; if (photo) { setSelected(photo.id); setViewerFailed(false); setAttempt(0); } }
  const content = (id: string, variant = "thumbnail") => `/api/v1/media/${id}/content?audience=${audience}&variant=${variant}&retry=${attempt}`;
  return <><header className="gallery-heading"><div><span className="wedding-kicker">Wedding memories</span><h1>{data ? `${data.couple.brideName} & ${data.couple.groomName}` : "Wedding gallery"}</h1><p>A collection of moments, shared with you.</p></div></header>
    {error && <section className="wedding-card gallery-empty"><h2>{data ? "Unable to refresh photos" : "Gallery unavailable"}</h2><p role="alert">{error}</p><button className="button button-primary" disabled={busy} onClick={() => load()}>Retry</button></section>}
    {!data && busy && <p role="status">Loading gallery…</p>}
    {data && <><GuestUploadPanel audience={audience} enabled={data.uploadsEnabled} onSaved={() => load()}/><p className="gallery-privacy">Shared wedding gallery · {data.count} {data.count === 1 ? "photo" : "photos"}{data.archived ? " · Archived" : ""}</p>{data.photos.length ? <section className="gallery-grid" aria-label="Shared wedding photos">{data.photos.map((photo, i) => <div key={photo.id}>{failed.includes(photo.id) ? <div className="gallery-photo-failed"><p>Photo unavailable</p><button className="button button-secondary" onClick={() => { setAttempt(a => a + 1); setFailed(list => list.filter(id => id !== photo.id)); }}>Retry photo</button></div> : <button className="gallery-photo" aria-label={`Open photo ${i + 1}`} onClick={() => open(photo.id)}><Image unoptimized src={content(photo.id)} alt={`Wedding photo ${i + 1}`} width={photo.width} height={photo.height} onError={() => setFailed(list => [...list, photo.id])}/></button>}</div>)}</section> : <section className="wedding-card gallery-empty"><h2>No photos yet</h2><p>The family’s shared photos will appear here.</p></section>}<div className="gallery-more">{data.nextCursor && <button className="button button-secondary" disabled={busy} onClick={() => load(true)}>{busy ? "Loading…" : "Load more photos"}</button>}<p>Showing {data.photos.length} of {data.count} photos</p><button className="button button-secondary" disabled={busy} onClick={() => load()}>Refresh gallery</button></div></>}
    <dialog ref={dialog} className="gallery-dialog gallery-viewer" aria-labelledby="guest-photo-title" onKeyDown={e => { if (e.key === "ArrowLeft") move(-1); if (e.key === "ArrowRight") move(1); }}><header><button className="button button-secondary" autoFocus onClick={() => dialog.current?.close()}>← Back to gallery</button><h2 id="guest-photo-title">Wedding photo</h2><button className="gallery-icon-button" aria-label="Close photo viewer" onClick={() => dialog.current?.close()}>×</button></header>{selected && <div className="gallery-viewer-image">{viewerFailed ? <div><p>We couldn’t load this photo.</p><button className="button button-secondary" onClick={() => { setAttempt(a => a + 1); setViewerFailed(false); }}>Retry photo</button></div> : <Image src={content(selected, "gallery")} unoptimized width={1600} height={1200} alt={`Wedding photo ${index + 1}`} onError={() => setViewerFailed(true)}/>}<button className="gallery-icon-button gallery-previous" aria-label="Previous photo" disabled={index <= 0} onClick={() => move(-1)}>‹</button><button className="gallery-icon-button gallery-next" aria-label="Next photo" disabled={!data || index >= data.photos.length - 1} onClick={() => move(1)}>›</button></div>}<footer><p>Photo {index + 1} of {data?.photos.length ?? 0} loaded photos</p></footer></dialog>
  </>;
}
