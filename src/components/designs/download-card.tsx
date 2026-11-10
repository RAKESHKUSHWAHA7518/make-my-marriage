"use client";
import { useRef, useState } from "react";
import { palettes, templateDraft, type DesignInput } from "@/modules/designs/schema";
import { wrapCardText } from "@/modules/designs/image-layout";

export function DownloadCard({ content, available, beforeDownload, label = "Download image (PNG)" }: { content: DesignInput; available: boolean; beforeDownload?: () => Promise<boolean>; label?: string }) {
  const lock = useRef(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  async function download() {
    if (lock.current || !available) return; lock.current = true; setBusy(true); setFailed(false);
    let bitmap: ImageBitmap | undefined;
    try {
      if (beforeDownload && !await beforeDownload()) return;
      const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d"); if (!ctx) throw Error();
      if (content.mode === "uploaded_image") {
        const response = await fetch(`/api/v1/media/${content.draft.assetIds[0]}/content?variant=gallery`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw Error(); const blob = await response.blob(); if (blob.size > 4_000_000 || blob.type !== "image/jpeg") throw Error();
        bitmap = await createImageBitmap(blob); if (bitmap.width * bitmap.height > 16_000_000) throw Error();
        canvas.width = bitmap.width; canvas.height = bitmap.height; ctx.drawImage(bitmap, 0, 0);
      } else {
        const d = templateDraft.parse(content.draft), p = palettes[d.layout.palette];
        const css = getComputedStyle(document.documentElement), heading = css.getPropertyValue("--font-heading").trim() || "Georgia", body = css.getPropertyValue("--font-body").trim() || "sans-serif";
        const chosen = d.layout.font === "classic" ? "Georgia" : d.layout.font === "modern" ? body : heading;
        await Promise.all([document.fonts.load(`40px ${chosen}`), document.fonts.load(`26px ${body}`)]);
        const blocks = [{ text: d.textFields.heading.toUpperCase(), size: 24, font: body }, { text: d.textFields.coupleNames, size: 70, font: chosen }, { text: d.textFields.message, size: 38, font: chosen }, { text: d.textFields.closing, size: 26, font: body }].map(b => { ctx.font = `${b.size}px ${b.font}`; return { ...b, lines: wrapCardText(b.text, t => ctx.measureText(t).width, 790), lineHeight: Math.ceil(b.size * 1.65) }; });
        const needed = blocks.reduce((sum, b) => sum + b.lines.length * b.lineHeight + 60, 0) + 180;
        canvas.width = 1000; canvas.height = Math.max(1400, needed); if (canvas.height > 30000) throw Error("Card is too tall to export in this browser");
        ctx.fillStyle = p.background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = p.accent; ctx.lineWidth = d.templateKey === "soft" ? 4 : 1;
        if (d.templateKey !== "modern") ctx.strokeRect(25, 25, canvas.width - 50, canvas.height - 50);
        ctx.textAlign = d.templateKey === "modern" ? "left" : "center"; ctx.textBaseline = "top"; ctx.fillStyle = p.text;
        const x = d.templateKey === "modern" ? 105 : 500; let y = Math.max(90, (canvas.height - (needed - 180)) / 2);
        for (const b of blocks) { ctx.font = `${b.size}px ${b.font}`; for (const line of b.lines) { ctx.fillText(line, x, y); y += b.lineHeight; } y += 60; }
      }
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error()), "image/png"));
      const url = URL.createObjectURL(png), a = document.createElement("a"); a.href = url; a.download = `${content.name.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80) || "invitation"}.png`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setFailed(true); } finally { bitmap?.close(); lock.current = false; setBusy(false); }
  }
  return <div><button className="button button-primary" type="button" onClick={download} disabled={busy || !available}>{busy ? "Preparing image…" : failed ? "Retry download" : label}</button>{failed && <p role="alert">The image could not be prepared. Please retry.</p>}<p className="task-helper">A digital image copy. Downloaded files cannot be recalled.</p></div>;
}
