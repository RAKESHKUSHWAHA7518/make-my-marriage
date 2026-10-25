"use client";
import Link from "next/link";
import { useTransition } from "react";
export default function GuestError({ retry }: { retry: () => void }) { const [pending, start] = useTransition(); return <main className="workspace-main"><section className="workspace-panel event-empty"><h1>Guest groups are temporarily unavailable</h1><p role="alert">We couldn’t load your guest records. Saved details have not been changed.</p><div className="event-form-actions"><button className="button button-primary" disabled={pending} onClick={() => start(retry)}>{pending ? "Trying again…" : "Retry"}</button><Link className="button button-secondary" href="/wedding">Back to workspace</Link></div></section></main>; }
