"use client";
import Link from "next/link";
export default function DiscoveryError({ retry }: { retry: () => void }) { return <main className="workspace-main"><section className="workspace-panel event-empty"><h1>Business search is temporarily unavailable</h1><p>We couldn’t open discovery. Your saved vendor details have not been changed.</p><div className="event-form-actions"><button className="button button-primary" onClick={retry}>Retry loading</button><Link className="button button-secondary" href="/wedding/vendors">Back to saved vendors</Link></div></section></main>; }
