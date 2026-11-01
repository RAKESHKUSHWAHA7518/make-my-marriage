"use client";
import { useRef, useState } from "react";
import type { listAnnouncements } from "@/modules/announcements/service";
import { AnnouncementCard } from "./announcement-display";
export function AnnouncementFeed({ initial, weddingId, timezone, readOnly }: { initial: Awaited<ReturnType<typeof listAnnouncements>>; weddingId: string; timezone: string; readOnly: boolean }) {
  const [items, setItems] = useState(initial.data), [cursor, setCursor] = useState(initial.pagination.nextCursor), [busy, setBusy] = useState(false), [error, setError] = useState(""), [blocked, setBlocked] = useState(false), lock = useRef(false);
  async function loadMore() {
    if (!cursor || lock.current || blocked) return; lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/announcements?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) }); const result = await response.json();
      if (!response.ok) { if ([401, 403, 404].includes(response.status)) { setItems([]); setCursor(null); setBlocked(true); } throw Error(result.error?.message ?? "Unable to load more announcements."); }
      if (!Array.isArray(result.data?.data) || !result.data.pagination || !(result.data.pagination.nextCursor === null || typeof result.data.pagination.nextCursor === "string")) throw Error("Unable to confirm the next page.");
      setItems(previous => { const ids = new Set(previous.map(i => i.id)); return [...previous, ...result.data.data.filter((i: { id: string }) => !ids.has(i.id))]; }); setCursor(result.data.pagination.nextCursor);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load more announcements. Please retry."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <><div className="announcement-feed">{items.map(item => <AnnouncementCard key={`${item.id}:${item.version}`} item={item} weddingId={weddingId} timezone={timezone} readOnly={readOnly || blocked} />)}</div>{error && <p role="alert" className="wedding-notice">{error}</p>}{cursor && <div className="announcement-load-more"><button type="button" disabled={busy || blocked} className="button button-secondary" onClick={loadMore}>{busy ? "Loading announcements…" : error ? "Retry loading more" : "Load more announcements"}</button><p>Refresh the list to see the latest posts and pin changes.</p></div>}{blocked && <a className="button button-secondary" href="/login">Sign in again</a>}</>;
}
