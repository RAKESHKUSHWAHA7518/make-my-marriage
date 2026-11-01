import { PrivateCover } from "./private-cover";
import { WeddingCelebration } from "./public-website";
import type { WebsitePreview } from "@/modules/website/service";
export function WebsitePreviewContent({ preview }: { preview: WebsitePreview }) {
  return <WeddingCelebration content={preview} privatePreview cover={preview.coverAssetId ? <PrivateCover assetId={preview.coverAssetId} /> : undefined} />;
}
