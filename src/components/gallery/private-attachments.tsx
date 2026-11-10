"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { directUpload, formatPhotoBytes, jsonRequest, RequestError } from "@/components/gallery/upload-transport";
import { attachmentFormat, attachmentTargets, privateAttachmentLimit, privateAttachmentMaxBytes, type AttachmentPurpose } from "@/modules/media/attachment-policy";
import type { PrivateAttachment } from "@/modules/media/attachments";

type Item = { file: File; key: string; intent?: string; status: "Selected" | "Uploading" | "Processing" | "Ready" | "Failed"; progress: number; error?: string; blocked?: boolean };
type AttachmentList = { files: PrivateAttachment[]; readOnly: boolean };
const fileUrl = (file: PrivateAttachment, variant: "gallery" | "download") => `/api/v1/media/${file.id}/content?variant=${variant}`;

export function PrivateAttachments({ purpose, weddingId, resourceId, readOnly }: { purpose: AttachmentPurpose; weddingId: string; resourceId: string; readOnly: boolean }) {
  const target = attachmentTargets[purpose];
  const url = `/api/v1/weddings/${weddingId}/${target.collection}/${resourceId}/${target.route}`;
  const receipt = purpose === "receipt";
  const title = receipt ? "Receipts" : "Attachments";
  const label = receipt ? "receipt" : "attachment";
  const scope = receipt ? "expense" : "task";
  const router = useRouter();
  const [list, setList] = useState<AttachmentList>();
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [queue, setQueue] = useState<Item[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [selected, setSelected] = useState<{ file: PrivateAttachment; remove: boolean }>();
  const [imageFailed, setImageFailed] = useState(false);
  const lock = useRef(false), dialog = useRef<HTMLDialogElement>(null);
  const archived = readOnly || list?.readOnly;

  useEffect(() => {
    let current = true;
    jsonRequest(url).then(data => { if (current) { setList(data); setLoadError(""); } })
      .catch(error => { if (current) setLoadError(error instanceof RequestError ? error.message : "Couldn’t load attachments."); });
    return () => { current = false; };
  }, [url, attempt]);

  function selectFiles(files: File[]) {
    const next: Item[] = [], errors: string[] = [];
    const available = privateAttachmentLimit - (list?.files.length ?? 0) - queue.filter(item => item.status !== "Ready").length;
    for (const file of files) {
      let error = "";
      if (!attachmentFormat(file.type, file.name) || file.name.length > 200 || /[\\/\u0000-\u001f\u007f]/.test(file.name)) error = "Choose a PDF, JPEG, PNG or WebP with a valid filename.";
      else if (file.size < 1 || file.size > privateAttachmentMaxBytes) error = "Choose a file between 1 byte and 4 MB.";
      else if (next.length >= available) error = `Each ${scope} can hold up to 20 files.`;
      if (error) errors.push(`${file.name} — ${error}`);
      else next.push({ file, key: crypto.randomUUID(), status: "Selected", progress: 0 });
    }
    setQueue(items => [...items.filter(item => item.status !== "Ready"), ...next]);
    setSelectionError(errors.join(" "));
  }

  async function upload(items: Item[]) {
    if (lock.current || archived || !list) return;
    lock.current = true;
    setBusy(true);
    let changed = false;
    try {
      for (const item of items) {
        const update = (patch: Partial<Item>) => setQueue(previous => previous.map(row => row.key === item.key ? { ...row, ...patch } : row));
        let intentId = item.intent;
        const complete = () => jsonRequest(`/api/v1/media/intents/${intentId}/complete`, "POST", {});
        try {
          update({ status: "Processing", error: undefined });
          if (!intentId || !(await complete())?.ready) {
            const intent = await jsonRequest("/api/v1/media/intents", "POST", {
              purpose, [target.context]: resourceId, filename: item.file.name, contentType: item.file.type, sizeBytes: String(item.file.size),
            }, item.key);
            if (!/^[a-f0-9]{24}$/.test(intent?.id)) throw Error("Upload intent unavailable");
            intentId = intent.id;
            update({ intent: intentId, status: "Uploading", progress: 0 });
            try { await directUpload(item.file, intent.upload, progress => update({ progress })); } catch { /* Reconcile the same target before retrying. */ }
            update({ status: "Processing" });
            if (!(await complete())?.ready) throw Error("Attachment still processing");
          }
          update({ status: "Ready", progress: 100 });
          changed = true;
        } catch (error) {
          update({
            status: "Failed",
            error: error instanceof RequestError ? error.message : "We couldn’t confirm this upload. Retry to check the same file.",
            blocked: error instanceof RequestError && [401, 403, 404, 409, 422].includes(error.status),
          });
        }
      }
    } finally {
      if (changed) {
        setAttempt(value => value + 1);
        router.refresh();
      }
      lock.current = false;
      setBusy(false);
    }
  }

  function open(file: PrivateAttachment, remove = false) {
    setSelected({ file, remove });
    setDialogError("");
    setImageFailed(false);
    dialog.current?.showModal();
  }

  async function remove() {
    if (!selected || lock.current || archived) return;
    lock.current = true;
    setBusy(true);
    setDialogError("");
    try {
      const { file } = selected;
      await jsonRequest(`${url}/${file.id}/remove`, "POST", { expectedVersion: file.version });
      setList(previous => previous && { ...previous, files: previous.files.filter(row => row.id !== file.id) });
      dialog.current?.close();
      setAttempt(value => value + 1);
      router.refresh();
    } catch (error) {
      setDialogError(error instanceof RequestError ? error.message : "Couldn’t confirm removal. Retry to check the same file.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const selectedFiles = queue.filter(item => item.status === "Selected");
  return <section className="workspace-panel private-attachments" aria-labelledby="private-attachments-title">
    <header className="private-attachments-header">
      <h2 id="private-attachments-title">{title} {list && <span className="private-attachment-count" aria-label={`${list.files.length} saved`}>{list.files.length}</span>}</h2>
      <span>Private to your planning family</span>
    </header>
    {!list && !loadError && <p className="private-attachment-state" role="status">Loading {target.route}…</p>}
    {loadError && <div className="private-attachment-state"><p role="alert">{loadError}</p><button type="button" className="button button-secondary" onClick={() => { setLoadError(""); setAttempt(value => value + 1); }}>Retry</button></div>}
    {list && <>
      {archived ? <p className="private-attachment-state">This wedding is archived. {title} are read-only.</p> :
        <div className="private-attachment-state">
          <label htmlFor="private-attachment-files"><strong>{receipt ? "Add receipts" : "Add files"}</strong></label>
          <p id="private-attachment-limits">PDF, JPEG, PNG or WebP. Up to 4 MB per file and 20 per {scope}.</p>
          <input id="private-attachment-files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" aria-describedby="private-attachment-limits" disabled={busy || list.files.length >= privateAttachmentLimit} onChange={event => { selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          {selectionError && <p role="alert" className="private-attachment-filename">{selectionError}</p>}
        </div>}
      {!!queue.length && <ul className="private-attachment-list" aria-label="Selected uploads">{queue.map(item => <li key={item.key}>
        <strong className="private-attachment-filename">{item.file.name}</strong>
        <p role="status">{item.status} · {formatPhotoBytes(item.file.size)}</p>
        {item.status === "Uploading" && <progress value={item.progress} max={100} aria-label={`Uploading ${item.file.name}`} />}
        {item.error && <p role="alert">{item.error}</p>}
        <div className="private-attachment-actions">
          {item.status === "Failed" && !item.blocked && !archived && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void upload([item])}>Retry upload</button>}
          {item.status !== "Ready" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => setQueue(rows => rows.filter(row => row.key !== item.key))}>Remove selection</button>}
        </div>
      </li>)}</ul>}
      {!archived && !!selectedFiles.length && <button type="button" className="button button-primary" disabled={busy} onClick={() => void upload(selectedFiles)}>Upload selected files</button>}
      {!list.files.length && <p className="private-attachment-state"><strong>No {target.route} yet.</strong> {!archived && (receipt ? "Add proof of spending for this expense." : "Add reference files for this task.")}</p>}
      {!!list.files.length && <ul className="private-attachment-list" aria-label={`Saved ${target.route}`}>{list.files.map(file => <li className="private-attachment-saved" key={file.id}>
        <div><strong className="private-attachment-filename">{file.filename}</strong><p>{file.format.toUpperCase()} · {formatPhotoBytes(file.bytes)}</p></div>
        <div className="private-attachment-actions">
          <button type="button" className="button button-secondary" onClick={() => open(file)} aria-label={`${file.format === "pdf" ? "File details" : "Preview"} for ${file.filename}`}>{file.format === "pdf" ? "File details" : "Preview"}</button>
          <a className="button button-secondary" href={fileUrl(file, "download")} download aria-label={`Download ${file.filename}`}>Download</a>
          {!archived && <button type="button" className="button button-secondary" disabled={busy} onClick={() => open(file, true)} aria-label={`Remove ${file.filename}`}>Remove</button>}
        </div>
      </li>)}</ul>}
    </>}
    <dialog ref={dialog} className="wedding-dialog private-attachment-dialog" aria-labelledby="private-attachment-dialog-title" onCancel={event => { if (lock.current) event.preventDefault(); }} onClose={() => setSelected(undefined)}>
      {selected && <>
        <h2 id="private-attachment-dialog-title">{selected.remove ? `Remove ${label}?` : receipt ? "Receipt details" : "Attachment details"}</h2>
        <p className="private-attachment-filename">{selected.file.filename} · {selected.file.format.toUpperCase()} · {formatPhotoBytes(selected.file.bytes)}</p>
        {selected.remove ? <p>{receipt ? "This receipt will be removed. The saved expense and its amount will stay in place." : "This file will be removed from the task."}</p> : selected.file.format === "pdf" || imageFailed ?
          <p>{imageFailed ? "Preview unavailable. You can try downloading the file." : "Download the PDF to open it."}</p> :
          <Image src={fileUrl(selected.file, "gallery")} alt={selected.file.filename} width={720} height={480} unoptimized onError={() => setImageFailed(true)} />}
        {dialogError && <p role="alert">{dialogError}</p>}
        <div className="private-attachment-actions">
          <button type="button" className="button button-secondary" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>{selected.remove ? "Keep file" : "Close"}</button>
          {selected.remove ? <button type="button" className="button button-primary" disabled={busy || archived} onClick={() => void remove()}>{busy ? "Removing…" : dialogError ? "Retry removal" : `Remove ${label}`}</button>
            : <a className="button button-primary" href={fileUrl(selected.file, "download")} download>Download</a>}
        </div>
      </>}
    </dialog>
  </section>;
}
