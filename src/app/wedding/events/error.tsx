"use client";
import Link from "next/link";
import { useTransition } from "react";
export default function EventError({ retry }: { retry: () => void }) {
  const [pending, start] = useTransition();
  return <main className="workspace-main events-page"><section className="workspace-panel event-empty"><h1>Unable to load celebrations</h1><p role="alert">Event planning is temporarily unavailable. Your saved details have not been changed.</p><div className="event-form-actions"><button className="button button-primary" disabled={pending} onClick={() => start(retry)}>{pending ? "Trying again…" : "Retry loading"}</button><Link href="/wedding" className="button button-secondary">Back to overview</Link></div></section></main>;
}
