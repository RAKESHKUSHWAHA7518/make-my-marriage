"use client";
import { useState } from "react";
export function CopyWebsiteLink({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  return <><button className="button button-secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Website link copied."); } catch { setMessage("Copy the address shown above."); } }}>Copy website link</button><span role="status" className="website-helper">{message}</span></>;
}
