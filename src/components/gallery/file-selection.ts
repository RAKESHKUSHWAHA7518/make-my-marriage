export const maxGalleryFileBytes = 20_000_000;
export function gallerySelectionError(files: { name: string; type: string; size: number }[], existing = 0) {
  if (files.length + existing > 20) return "Choose up to 20 photos in one selection. No additional files were added.";
  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) return `${file.name}: choose a JPEG, PNG or WebP photo. HEIC is not supported yet.`;
    if (file.size <= 0 || file.size > maxGalleryFileBytes) return `${file.name}: choose a nonempty photo no larger than 20 MB.`;
  }
  return "";
}
