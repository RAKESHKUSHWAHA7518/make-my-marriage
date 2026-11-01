"use client";
import Link from "next/link";
export default function AnnouncementError({ retry }: { retry: () => void }) { return <main className="workspace-main announcement-page"><section className="workspace-panel workspace-empty"><h1>Unable to load announcements</h1><p>Please try again.</p><div className="announcement-actions"><button className="button button-primary" type="button" onClick={retry}>Retry</button><Link className="button button-secondary" href="/wedding">Back to workspace</Link></div></section></main>; }
