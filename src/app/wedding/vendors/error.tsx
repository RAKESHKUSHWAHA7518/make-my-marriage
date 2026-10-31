"use client";
import Link from "next/link";
export default function VendorError({ retry }: { retry: () => void }) { return <main className="workspace-main"><section className="workspace-panel event-empty"><h1>Vendor contacts are temporarily unavailable</h1><p>We couldn’t load your contacts. Your saved details have not been changed.</p><div className="event-form-actions"><button className="button button-primary" onClick={retry}>Retry</button><Link className="button button-secondary" href="/wedding">Back to workspace</Link></div></section></main>; }
