import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { GalleryPreview } from "../src/components/gallery/gallery-preview";
import { gallerySelectionError } from "../src/components/gallery/file-selection";

test("gallery selection rejects unsupported, empty, oversize and over-count batches", () => {
  const photo = { name: "photo.jpg", type: "image/jpeg", size: 20_000_000 };
  assert.equal(gallerySelectionError([photo]), "");
  for (const invalid of [{ ...photo, name: "photo.heic" }, { ...photo, type: "image/svg+xml" }, { ...photo, size: 20_000_001 }, { ...photo, size: 0 }]) assert.notEqual(gallerySelectionError([invalid]), "");
  assert.notEqual(gallerySelectionError(Array(21).fill(photo)), "");
  assert.notEqual(gallerySelectionError([photo], 20), "");
});
test("gallery initial markup identifies preview and never implies live upload readiness", () => {
  const html = renderToStaticMarkup(<GalleryPreview archived={false}/>);
  assert.match(html, /Wedding gallery/); assert.match(html, /UI preview/);
  assert.match(html, /No photos yet/); assert.match(html, /Uploads not connected/);
  assert.match(html, /Guest sharing will follow/);
  assert.doesNotMatch(html, /5\.0 GB|Concierge|View EXIF|Download original/);
});
test("archived wedding hides content mutation actions", () => {
  const html = renderToStaticMarkup(<GalleryPreview archived={true}/>);
  assert.match(html, /This wedding is archived/);
  assert.doesNotMatch(html, /＋ Upload photos/);
  assert.doesNotMatch(html, />Remove photo<\/button>/);
});
