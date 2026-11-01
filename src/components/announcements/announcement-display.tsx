import Link from "next/link";
import type { AnnouncementSummary, AnnouncementView } from "@/modules/announcements/service";
import { AnnouncementActions } from "./announcement-actions";
import { AnnouncementRefresh } from "./announcement-refresh";
export function announcementDate(value: string, timezone: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
export function AnnouncementCard({ item, weddingId, timezone, readOnly }: { item: AnnouncementView; weddingId: string; timezone: string; readOnly: boolean }) {
  return <article id={`announcement-${item.id}`} className={`announcement-card workspace-panel${item.pinned ? " announcement-pinned" : ""}`}>
    <div className="announcement-card-meta">{item.pinned && <span className="announcement-pin-badge">Pinned</span>}<time dateTime={item.createdAt}>{announcementDate(item.createdAt, timezone)}</time></div>
    <h2><Link href={`/wedding/announcements/${item.id}`}>{item.title}</Link></h2><p className="announcement-message">{item.body}</p>
    <footer><div className="announcement-author"><span aria-hidden="true">{item.author.name.slice(0, 1).toUpperCase()}</span><p>Posted by {item.author.name}{item.version > 1 && <small>Edited {announcementDate(item.updatedAt, timezone)}</small>}</p></div>{!readOnly && <AnnouncementActions weddingId={weddingId} item={item} />}</footer>
  </article>;
}
export function AnnouncementDashboard({ items, timezone, archived }: { items: AnnouncementSummary | null; timezone: string; archived: boolean }) {
  return <section className="workspace-panel announcement-dashboard"><div className="workspace-panel-heading"><div><h2>Family announcements</h2><p>Private updates for your planning family.</p></div><Link href="/wedding/announcements">View all announcements →</Link>{!archived && items && <Link href="/wedding/announcements/new" className="button button-primary">+ New announcement</Link>}</div>
    {items === null ? <div className="workspace-empty"><h3>Announcements are temporarily unavailable</h3><p>The rest of your workspace is still available.</p><AnnouncementRefresh /></div> : !items.length ? <div className="workspace-empty"><h3>No family updates yet.</h3><p>Post an announcement to keep everyone informed.</p>{!archived && <Link href="/wedding/announcements/new" className="button button-secondary">Post your first announcement</Link>}</div> : <div className="announcement-dashboard-list">{items.map(item => <Link key={item.id} href={`/wedding/announcements/${item.id}`}><div>{item.pinned && <span className="announcement-pin-badge">Pinned</span>}<h3>{item.title}</h3></div><p>{item.excerpt}</p><small>{item.author.name} · {announcementDate(item.createdAt, timezone)}</small></Link>)}</div>}
  </section>;
}
