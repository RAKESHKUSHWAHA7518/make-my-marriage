"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function ExchangeInvitation() {
  const router = useRouter(), latest = useRef(""), pending = useRef(false), mounted = useRef(false);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [hasToken, setHasToken] = useState(false);
  async function exchange() {
    if (pending.current || !latest.current) return;
    pending.current = true; setLoading(true); setError("");
    // Serialize fragment changes so older responses cannot replace a newer household cookie.
    while (mounted.current && latest.current) {
      const token = latest.current;
      try {
        const response = await fetch("/api/v1/access/exchange", { method: "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1" }, body: JSON.stringify({ kind: "household", token }), signal: AbortSignal.timeout(20000) });
        const result = await response.json();
        if (!mounted.current) break;
        if (latest.current !== token) continue;
        if (response.ok && result.data?.redirectPath === "/guest") { latest.current = ""; router.replace("/guest"); router.refresh(); break; }
        setError(response.status === 404 ? "This invitation is unavailable. Please contact the family who shared it." : result.error?.message ?? "Invitations are temporarily unavailable. Please retry."); break;
      } catch {
        if (!mounted.current) break;
        if (latest.current !== token) continue;
        setError("We couldn’t load your invitation. Please retry. If a previous request is still completing, wait a moment before retrying."); break;
      }
    }
    pending.current = false; if (mounted.current) setLoading(false);
  }
  const exchangeRef = useRef(exchange);
  useEffect(() => { exchangeRef.current = exchange; });
  useEffect(() => {
    mounted.current = true;
    const read = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (params.has("token")) { latest.current = params.get("token") ?? ""; window.history.replaceState(null, "", window.location.pathname); }
      setHasToken(!!latest.current);
      if (latest.current) void exchangeRef.current();
      else { setLoading(false); setError("This invitation is unavailable. Please contact the family who shared it."); }
    };
    read(); window.addEventListener("hashchange", read);
    return () => { mounted.current = false; window.removeEventListener("hashchange", read); };
  }, []);
  return <section className="invitation-panel invitation-empty" aria-busy={loading}><h1>{loading ? "Opening your invitation…" : "Your invitation"}</h1>{error && <p role="alert">{error}</p>}{!loading && hasToken && <button type="button" className="button button-primary" onClick={exchange}>Retry</button>}</section>;
}
