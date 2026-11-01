"use client";
import { useState } from "react";
export function PublicCover({ slug, assetId }: { slug: string; assetId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="website-hint" role="status">The cover photo is temporarily unavailable.</p>;
  // Application authorization must run on every request; never optimize/cache this URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="website-preview-cover" src={`/api/public/weddings/${encodeURIComponent(slug)}/media/${assetId}`} alt="Wedding cover selected by the family" onError={() => setFailed(true)} />;
}
