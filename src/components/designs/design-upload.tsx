"use client";
import { useRef, useState } from "react";
import { directUpload, jsonRequest, RequestError } from "@/components/gallery/upload-transport";
import { gallerySelectionError } from "@/components/gallery/file-selection";
export function DesignUpload({ eventIds, disabled, onChange, onBusy }: { eventIds: string[]; disabled: boolean; onChange: (id?: string) => void; onBusy: (busy: boolean) => void }) {
  const file = useRef<{ file: File; key: string; eventIds: string[]; intent?: string } | null>(null), locked = useRef(false);
  const [state, setState] = useState("No new file selected"), [error, setError] = useState(""), [progress, setProgress] = useState(0), [ready, setReady] = useState(false), [blocked, setBlocked] = useState(false), [hasFile, setHasFile] = useState(false), [busy, setBusy] = useState(false);
  async function upload() {
    if (disabled || locked.current || !file.current || blocked) return; const item = file.current; locked.current = true; setBusy(true); onBusy(true); setError("");
    try {
      if (item.intent) { setState("Checking upload…"); const saved = await jsonRequest(`/api/v1/media/intents/${item.intent}/complete`, "POST", {}); if (saved?.ready && /^[a-f0-9]{24}$/.test(saved.assetId)) { onChange(saved.assetId); setReady(true); setState("Ready to save"); return; } }
      setState("Preparing upload…"); const intent = await jsonRequest("/api/v1/media/intents", "POST", { purpose: "invitation", eventIds: item.eventIds, filename: item.file.name, contentType: item.file.type, sizeBytes: String(item.file.size) }, item.key);
      if (!/^[a-f0-9]{24}$/.test(intent?.id)) throw Error(); item.intent = intent.id; setState("Uploading image…");
      try { await directUpload(item.file, intent.upload, setProgress); } catch { /* Completion independently verifies an uncertain transfer. */ }
      setState("Checking image…"); const result = await jsonRequest(`/api/v1/media/intents/${item.intent}/complete`, "POST", {});
      if (!result?.ready || !/^[a-f0-9]{24}$/.test(result.assetId)) throw Error(); onChange(result.assetId); setReady(true); setState("Ready to save");
    } catch (e) { setError(e instanceof RequestError ? e.message : "Upload could not be confirmed. Retry to check the same upload."); setState("Upload needs checking"); if (e instanceof RequestError && [401,403,404,409,422].includes(e.status)) setBlocked(true); }
    finally { locked.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="design-upload"><h2>Invitation image</h2><p>JPEG, PNG or WebP, up to 20 MB. This image will not appear in the shared gallery.</p><label className="design-file-picker">{hasFile ? "Replace image" : "Choose an invitation image"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={e => { const chosen = e.target.files?.[0]; if (!chosen) return; const invalid = gallerySelectionError([chosen]); if (invalid) { setError(invalid); e.target.value = ""; return; } file.current = { file: chosen, key: crypto.randomUUID(), eventIds: [...eventIds] }; setHasFile(true); setError(""); setReady(false); setBlocked(false); setProgress(0); setState(chosen.name); onChange(undefined); }} /></label><p role="status">{state}</p>{progress > 0 && !ready && <progress value={progress} max={100} aria-label="Image upload progress" />}{error && <p role="alert" className="event-form-error">{error}</p>}{hasFile && !ready && !blocked && <button className="button button-secondary" type="button" disabled={disabled || busy} onClick={upload}>{error ? "Retry same upload" : "Upload image"}</button>}<p className="task-helper">Choose the event scope before choosing a file. If you change that scope, select the image again. Uploading does not save the draft.</p></section>;
}
