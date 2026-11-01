"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
import { vendorCategories, vendorCategoryLabels } from "@/modules/vendors/schema";
import { discoveryQuerySchema, type DiscoveredPlace, type DiscoveryPage } from "@/modules/vendors/discovery-schema";
import { VendorForm } from "./vendor-form";

type Search = { category: string; location: string; cursor?: string };
type Operation = { kind: "search"; query: Search } | { kind: "details"; placeId: string };
type Failure = { message: string; signIn: boolean; retryable: boolean };
export function PlacesAttribution({ providers = [] }: { providers?: DiscoveredPlace["attributions"] }) {
  return <div className="planning-discovery-attribution"><span>Business information from</span><Image src="/brand/google-maps-attribution.svg" alt="Google Maps" width={98} height={18} unoptimized />{providers.map((a, i) => <a key={`${a.uri}-${i}`} href={a.uri} target="_blank" rel="noopener noreferrer">{a.name}</a>)}</div>;
}
export function PlaceInformation({ place, detailed = false }: { place: DiscoveredPlace; detailed?: boolean }) {
  return <>
    <div className="planning-discovery-place-heading"><span className="planning-discovery-icon"><WeddingIcon name="store" /></span><div><span className="planning-vendor-category">{place.typeLabel || "Business listing"}</span><h2>{place.name}</h2></div></div>
    {place.businessStatus === "CLOSED_PERMANENTLY" ? <p className="wedding-notice">Reported permanently closed</p> : place.businessStatus === "CLOSED_TEMPORARILY" ? <p className="wedding-notice">Reported temporarily closed</p> : place.businessStatus === "FUTURE_OPENING" ? <p className="wedding-notice">Opening in the future</p> : null}
    {place.address && <p className="planning-discovery-address"><WeddingIcon name="pin" />{place.address}</p>}
    <p className="planning-discovery-rating">{place.rating !== undefined ? <><span aria-label={`${place.rating} out of 5 stars`}>★ {place.rating}</span>{place.reviewCount !== undefined && ` (${place.reviewCount.toLocaleString("en-IN")} Google ratings)`}</> : "No rating provided"}</p>
    {detailed && <dl className="planning-discovery-contacts"><div><dt>Address</dt><dd>{place.address || "Not provided"}</dd></div><div><dt>Telephone</dt><dd>{place.phone ? <a href={`tel:${place.phone.replace(/[^\d+]/g, "")}`}>{place.phone}</a> : "Not provided"}</dd></div><div><dt>Website</dt><dd>{place.websiteUrl ? <a href={place.websiteUrl} target="_blank" rel="noopener noreferrer">Visit business website ↗</a> : "Not provided"}</dd></div></dl>}
    {place.mapsUrl && <a className="planning-vendor-view-link" href={place.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>}
    <PlacesAttribution providers={place.attributions} />
  </>;
}
export function VendorDiscovery({ weddingId, available, archived, termsUrl, privacyUrl, events = [], canSave = false }: { weddingId: string; available: boolean; archived: boolean; termsUrl: string | null; privacyUrl: string | null; events?: { id: string; name: string }[]; canSave?: boolean }) {
  const [category, setCategory] = useState(""), [location, setLocation] = useState("");
  const [results, setResults] = useState<DiscoveryPage | null>(null), [searched, setSearched] = useState<Search | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<DiscoveredPlace | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Operation["kind"] | null>(null), [failure, setFailure] = useState<Failure | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const request = useRef<{ id: number; controller: AbortController } | null>(null), generation = useRef(0), retry = useRef<Operation | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { generation.current++; request.current?.controller.abort(); }, []);
  function stop() { generation.current++; request.current?.controller.abort(); request.current = null; setPending(null); }
  function reset() { stop(); retry.current = null; setCategory(""); setLocation(""); setFields({}); setResults(null); setSearched(null); setSelected(null); setDetail(null); setFailure(null); setSaving(false); }
  async function run(operation: Operation) {
    if (request.current || archived || !available) return;
    const id = ++generation.current, controller = new AbortController(); request.current = { id, controller }; retry.current = operation;
    setPending(operation.kind); setFailure(null); setSaving(false);
    if (operation.kind === "search") { setSelected(null); setDetail(null); setResults(null); setSearched(operation.query); }
    else { setSelected(operation.placeId); setDetail(null); }
    try {
      const params = new URLSearchParams(operation.kind === "search" ? operation.query : { placeId: operation.placeId });
      const response = await fetch(`/api/v1/weddings/${weddingId}/vendor-discovery${operation.kind === "details" ? "/details" : ""}?${params}`, { headers: { "X-MMM-CSRF": "1" }, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const value = await response.json(); if (generation.current !== id) return;
      if (!response.ok) {
        const signIn = response.status === 401;
        if (signIn || response.status === 403 || response.status === 404 || value.error?.code === "WEDDING_ARCHIVED") { setResults(null); setDetail(null); }
        setFailure({ message: value.error?.message || "Business discovery is temporarily unavailable. Please retry.", signIn, retryable: response.status === 429 || response.status >= 500 });
        return;
      }
      if (operation.kind === "details") setDetail(value.data); else setResults(value);
      requestAnimationFrame(() => heading.current?.focus());
    } catch {
      if (generation.current !== id) return;
      setFailure({ message: "We couldn’t load business information. Your search is still here. Please retry.", signIn: false, retryable: true });
    } finally { if (generation.current === id) { request.current = null; setPending(null); } }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valid = discoveryQuerySchema.safeParse({ category, location });
    if (!valid.success) { setFields(Object.fromEntries(valid.error.issues.map(i => [i.path.join("."), i.message]))); return; }
    setFields({}); void run({ kind: "search", query: valid.data });
  }
  function back() { stop(); setSelected(null); setDetail(null); setFailure(null); setSaving(false); retry.current = null; requestAnimationFrame(() => heading.current?.focus()); }
  const enabled = available && !archived;
  return <>
    <div className="planning-discovery-top"><Link href="/wedding/vendors">← Back to saved vendors</Link>{!archived && <Link href="/wedding/vendors/new">+ Add a vendor manually</Link>}</div>
    <header className="event-page-heading"><div><span className="wedding-kicker">Explore your options</span><h1>{saving ? "Save discovered vendor" : selected ? "Business details" : "Find vendors"}</h1><p>{saving ? "Keep your private planning details separate from public business information." : "Search businesses by category and location."}</p></div><span className="planning-discovery-label"><WeddingIcon name="globe" />Google Places</span></header>
    {archived ? <p className="wedding-notice">This wedding is archived. Saved vendor records remain available to view.</p> : !available && <section className="wedding-notice"><h2>Business discovery is temporarily unavailable</h2><p>You can still add your known contacts manually.</p><Link className="button button-secondary" href="/wedding/vendors/new">Add a vendor manually</Link></section>}
    {!selected && <form className="workspace-panel planning-discovery-search" onSubmit={submit} noValidate>
      <fieldset disabled={!enabled || pending !== null}><label>Vendor category <span aria-hidden="true">*</span><select aria-label="Vendor category" value={category} onChange={e => setCategory(e.target.value)} aria-invalid={!!fields.category} aria-describedby={fields.category ? "discovery-category-error" : undefined} required><option value="">Select a category</option>{vendorCategories.map(c => <option key={c} value={c}>{vendorCategoryLabels[c]}</option>)}</select>{fields.category && <small id="discovery-category-error" role="alert">{fields.category}</small>}</label><label>City or area <span aria-hidden="true">*</span><input aria-label="City or area" value={location} onChange={e => setLocation(e.target.value)} maxLength={200} placeholder="e.g. Udaipur, Rajasthan" autoComplete="off" aria-invalid={!!fields.location} aria-describedby={fields.location ? "discovery-location-error" : "discovery-location-help"} required />{fields.location && <small id="discovery-location-error" role="alert">{fields.location}</small>}</label><button className="button button-primary" type="submit">{pending === "search" ? "Searching…" : "Search businesses"}</button></fieldset>
      <div className="planning-discovery-search-footer"><p id="discovery-location-help"><WeddingIcon name="shield" />Search uses the location you enter. Device location is not accessed.</p><button type="button" className="button button-secondary" onClick={reset}>Clear / Reset</button></div>
    </form>}
    {selected && !saving && <button className="button button-secondary planning-discovery-back" onClick={back}>← Back to results</button>}
    {pending && <p role="status" className="planning-discovery-pending">{pending === "details" ? "Loading business details…" : "Searching businesses…"}</p>}
    {failure && <section className="workspace-panel planning-discovery-failure" role="alert"><h2>Business information unavailable</h2><p>{failure.message}</p>{failure.signIn ? <Link className="button button-primary" href="/login">Sign in</Link> : failure.retryable && <button className="button button-primary" disabled={!!pending} onClick={() => retry.current && void run(retry.current)}>Retry</button>}</section>}
    <div className="planning-discovery-layout"><div>
      {!selected && results && <><div className="workspace-panel planning-discovery-results-heading"><h2 ref={heading} tabIndex={-1}>{results.data.length ? `${results.data.length} ${results.data.length === 1 ? "business" : "businesses"} on this page` : "No businesses found"}</h2><p>{searched && `${vendorCategoryLabels[searched.category as keyof typeof vendorCategoryLabels]} · ${searched.location}`}</p></div>{results.data.length ? <div className="planning-discovery-results">{results.data.map(place => <article className="workspace-panel planning-discovery-card" key={place.placeId}><PlaceInformation place={place} /><div className="planning-vendor-form-actions"><button className="button button-secondary" disabled={!!pending} onClick={() => void run({ kind: "details", placeId: place.placeId })}>View business details →</button>{place.savedVendor && <Link className="button button-secondary" href={`/wedding/vendors/${place.savedVendor.id}`}>{place.savedVendor.status === "removed" ? "View removed vendor" : "Open saved vendor"}</Link>}</div></article>)}</div> : <p className="planning-vendor-planning-note">Try a nearby city or a different category. Some businesses may not be listed.</p>}{results.pagination.nextCursor && searched && <button className="button button-secondary planning-discovery-next" disabled={!!pending} onClick={() => void run({ kind: "search", query: { ...searched, cursor: results.pagination.nextCursor! } })}>Next results →</button>}</>}
      {selected && detail && <><section className="workspace-panel planning-discovery-card planning-discovery-detail"><h2 ref={heading} tabIndex={-1}>{saving ? "A · Public business information" : "Public business listing"}</h2><PlaceInformation place={detail} detailed={!saving} /><p className="planning-vendor-planning-note">This information is read-only and provided by Google Maps. Saving retains its place reference, not a permanent copy of the business information.</p>{detail.savedVendor ? <Link className="button button-secondary" href={`/wedding/vendors/${detail.savedVendor.id}`}>{detail.savedVendor.status === "removed" ? "View removed vendor" : "Open saved vendor"}</Link> : !saving && !archived && (canSave ? <button className="button button-primary" onClick={() => setSaving(true)}>Save to wedding</button> : <p className="wedding-notice">Saving discovered vendors is not enabled yet. Manual vendor contacts remain available.</p>)}</section>{saving && !detail.savedVendor && <div className="planning-discovery-save-form"><h2>B · Private wedding team details</h2><VendorForm key={detail.placeId} weddingId={weddingId} googlePlaceId={detail.placeId} suggestedCategory={searched?.category} events={events} /></div>}</>}
      {!selected && !results && !pending && !failure && enabled && <section className="workspace-panel planning-discovery-initial"><WeddingIcon name="store" /><h2>Find the right people for your celebrations</h2><p>Choose a category and enter a city or area to explore business listings.</p></section>}
    </div><aside className="planning-discovery-sidebar"><section className="planning-vendor-advice"><WeddingIcon name="edit" /><h2>Already know someone?</h2><p>Independent artists and family contacts may not be listed on Google Places.</p>{!archived && <Link className="button button-secondary" href="/wedding/vendors/new">+ Add a vendor manually</Link>}</section><section className="planning-vendor-advice"><WeddingIcon name="lock" /><h2>Your planning, your choice</h2><p>Searching does not send messages, request quotes or make a booking. Contact a business directly when you are ready.</p></section></aside></div>
    {termsUrl && privacyUrl && <nav className="planning-discovery-policies" aria-label="Discovery policies"><a href={termsUrl} target="_blank" rel="noopener noreferrer">Terms of Use ↗</a><a href={privacyUrl} target="_blank" rel="noopener noreferrer">Privacy Policy ↗</a></nav>}
  </>;
}
