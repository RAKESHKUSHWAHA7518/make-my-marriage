"use client";
import Image from "next/image";
import { useState } from "react";
export function PrivateCover({ assetId }: { assetId: string }) {
  const [failedId, setFailedId] = useState<string>();
  if (failedId === assetId) return <p className="website-hint" role="status">The selected photo could not be displayed. Your selection is retained. Try reloading the preview, or choose no cover photo.</p>;
  return <Image className="website-preview-cover" src={`/api/v1/media/${assetId}/content?variant=gallery`} width={1200} height={700} unoptimized alt="Selected wedding cover" onError={() => setFailedId(assetId)} />;
}
