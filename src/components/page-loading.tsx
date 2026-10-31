"use client";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";

/** Safe before authentication and page reads complete: no private data or fake totals. */
export function PageLoading({ title, description, variant = "list", guest = false }: {
  title: string; description: string; variant?: "list" | "cards" | "photos" | "form"; guest?: boolean;
}) {
  const [takingLonger, setTakingLonger] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTakingLonger(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);
  const content = <>
    <header className="page-loading-heading"><span className="wedding-kicker">{guest ? "Your private invitation" : "Your wedding workspace"}</span><h1>{title}</h1><p role="status">{description}</p></header>
    <div className="page-loading-help">
      {takingLonger && <p role="status">This is taking longer than usual. You can retry loading this page.</p>}
      <div className="event-form-actions">{takingLonger && <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Retry loading</button>}<a className="button button-secondary" href={guest ? "/" : "/wedding"}>{guest ? "Back to homepage" : "Back to workspace"}</a></div>
    </div>
    <div className={`page-loading-skeletons page-loading-${variant}`} aria-hidden="true">
      {variant === "list" && <div className="page-loading-metrics">{[0, 1, 2, 3].map(i => <div className="page-loading-card" key={i}><span /><span /></div>)}</div>}
      <div className="page-loading-items">{Array.from({ length: variant === "photos" ? 4 : variant === "form" ? 2 : 3 }, (_, i) => <div className="page-loading-card" key={i}><span /><span /><span /></div>)}</div>
    </div>
  </>;
  // The invitation layout already supplies its header and main landmark.
  if (guest) return <section className="page-loading-content page-loading-guest">{content}</section>;
  return <div className="page-loading-shell"><header className="page-loading-brand"><Brand /></header><main className="page-loading-content">{content}</main></div>;
}
