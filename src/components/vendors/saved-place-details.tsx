"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DiscoveredPlace } from "@/modules/vendors/discovery-schema";
import { PlaceInformation } from "./vendor-discovery";

/** Load on explicit action only; private labels/contacts never come from this response. */
export function SavedPlaceDetails({ weddingId, placeId, archived, available, termsUrl, privacyUrl }: { weddingId: string; placeId: string; archived: boolean; available: boolean; termsUrl: string | null; privacyUrl: string | null }) {
  const [place, setPlace] = useState<DiscoveredPlace | null>(null), [pending, setPending] = useState(false), [error, setError] = useState(""), [signedOut, setSignedOut] = useState(false);
  const request = useRef<AbortController | null>(null), generation = useRef(0);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
  async function load() {
    if (request.current || archived || !available) return;
    const controller = new AbortController(), id = ++generation.current; request.current = controller;
    setPending(true); setPlace(null); setError(""); setSignedOut(false);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/vendor-discovery/details?${new URLSearchParams({ placeId })}`, { headers: { "X-MMM-CSRF": "1" }, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const value = await response.json(); if (generation.current !== id) return;
      if (response.ok && value.data?.placeId === placeId) setPlace(value.data);
      else { setError(value.error?.message || "Business details are temporarily unavailable."); setSignedOut(response.status === 401); }
    } catch { if (generation.current === id) setError("Business details are temporarily unavailable. Your saved reference and private planning details are unchanged."); }
    finally { if (generation.current === id) { request.current = null; setPending(false); } }
  }
  return <section className="workspace-panel planning-vendor-detail-section planning-discovery-detail"><h2>Google business information</h2><p className="planning-vendor-helper">Live public information is separate from your independently entered planning details.</p>
    {archived ? <p className="planning-vendor-helper">Live discovery is unavailable for archived weddings. Your saved reference and private notes are retained.</p> : !available ? <p className="wedding-notice">Business details are temporarily unavailable. Your saved reference and private notes remain available.</p> : <button className="button button-secondary" onClick={() => void load()} disabled={pending}>{pending ? "Loading business details…" : place ? "Refresh business information" : error ? "Retry business information" : "Load business information"}</button>}
    {pending && <p role="status">Loading public business information…</p>}{error && <p role="alert">{error}{signedOut && <> <Link href="/login">Sign in again</Link></>}</p>}
    {place && <PlaceInformation place={place} detailed />}
    {termsUrl && privacyUrl && <nav className="planning-discovery-policies" aria-label="Business information policies"><a href={termsUrl} target="_blank" rel="noopener noreferrer">Terms of Use ↗</a><a href={privacyUrl} target="_blank" rel="noopener noreferrer">Privacy Policy ↗</a></nav>}
  </section>;
}
