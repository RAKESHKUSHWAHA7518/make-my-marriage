"use client";
/* Protected invitation images must use the authenticated origin route, not the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { templateDraft, palettes, type DesignInput } from "@/modules/designs/schema";
import { useState } from "react";
function PrivateImage({src}:{src:string}){const[failed,setFailed]=useState(false);return failed?<div><p>The invitation image could not be loaded.</p><button className="button button-secondary" type="button" onClick={()=>setFailed(false)}>Retry image</button></div>:<img src={src} alt="Invitation artwork" onError={()=>setFailed(true)}/>;}
export function DesignCard({ mode, draft, imageAvailable = true, imageSrc }: Pick<DesignInput, "mode" | "draft"> & { imageAvailable?: boolean; imageSrc?: string }) {
  if (mode === "uploaded_image") return <div className="design-image-card">{(imageSrc || draft.assetIds[0]) && imageAvailable ? <PrivateImage key={imageSrc ?? draft.assetIds[0]} src={imageSrc ?? `/api/v1/media/${draft.assetIds[0]}/content?variant=gallery`}/> : <p>Invitation image unavailable.</p>}</div>;
  const checked = templateDraft.safeParse(draft); if (!checked.success) return <div className="design-artwork"><p>Complete the invitation wording to preview your card.</p></div>;
  const d = checked.data, p = palettes[d.layout.palette];
  return <article aria-label="Invitation card artwork" className={`design-artwork design-artwork-${d.templateKey} design-font-${d.layout.font}`} style={{ background: p.background, color: p.text, borderColor: p.accent }}><span className="design-artwork-symbol" aria-hidden="true">✧</span><p className="design-card-heading">{d.textFields.heading}</p><h2>{d.textFields.coupleNames}</h2><span className="design-artwork-rule" style={{ background: p.accent }} /><p className="design-card-message">{d.textFields.message}</p>{d.textFields.closing && <p className="design-card-closing">{d.textFields.closing}</p>}</article>;
}
