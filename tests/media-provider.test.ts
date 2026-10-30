import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { signedGalleryUpload, verifiedGalleryMetadata, galleryDeliveryUrl, inspectGalleryAsset } from "../src/infrastructure/cloudinary/provider";

const id = `mmm/${"a".repeat(24)}/gallery/${"b".repeat(32)}`;
process.env.CLOUDINARY_CLOUD_NAME = "isolated-test";
process.env.CLOUDINARY_API_KEY = "123456";
process.env.CLOUDINARY_API_SECRET = "synthetic-provider-secret";
const asset = { asset_id: "provider-id", public_id: id, resource_type: "image", type: "authenticated", format: "jpg", bytes: 1024, width: 100, height: 100, version: 1 };

test("signed upload binds exact ID, formats, authenticated type and disabled overwrite", () => {
  const upload = signedGalleryUpload(id, new Date("2026-10-29T00:00:00Z"));
  const { signature, api_key, ...fields } = upload.fields;
  const expected = createHash("sha256").update(Object.keys(fields).sort().map(k => `${k}=${fields[k as keyof typeof fields]}`).join("&") + process.env.CLOUDINARY_API_SECRET).digest("hex");
  assert.equal(signature, expected); assert.equal(api_key, "123456");
  assert.equal(fields.type, "authenticated"); assert.equal(fields.overwrite, "false");
  assert.equal(fields.allowed_formats, "jpg,png,webp");
  assert(!JSON.stringify(upload).includes(process.env.CLOUDINARY_API_SECRET!));
  assert.throws(() => signedGalleryUpload("https://attacker.test/asset"));
});
test("metadata verification rejects wrong scope, public delivery, unsupported media and size lies", () => {
  for (const change of [{ public_id: id.replace(/b/g, "c") }, { type: "upload" }, { resource_type: "video" }, { bytes: 20_000_001 }, { bytes: -1 }, { width: 0 }, { format: "svg" }, { pages: 2 }]) assert.throws(() => verifiedGalleryMetadata({ ...asset, ...change }, id));
  const safe = verifiedGalleryMetadata({ ...asset, secure_url: "private-upstream", context: "private metadata" }, id);
  assert.equal(safe.bytes, 1024); assert(!JSON.stringify(safe).includes("private"));
});
test("delivery permits only bounded metadata-stripped authenticated derivatives", () => {
  const url = galleryDeliveryUrl(id, 1, "thumbnail");
  assert.match(url, /image\/authenticated\/s--/); assert.match(url, /w_480/); assert.match(url, /fl_strip_profile/);
  assert.throws(() => galleryDeliveryUrl(id, 1, "original" as "gallery"));
  assert.throws(() => galleryDeliveryUrl(id, -1, "gallery"));
});
test("provider lookup is fixed-host, authenticated and does not trust upload response URLs", async () => {
  const previous = globalThis.fetch; let requested = "";
  globalThis.fetch = async (url, init) => { requested = String(url); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store"); return Response.json(asset); };
  try { assert.equal((await inspectGalleryAsset(id))!.publicId, id); assert.match(requested, /^https:\/\/api.cloudinary.com\/v1_1\/isolated-test\/resources\/image\/authenticated\//); }
  finally { globalThis.fetch = previous; }
});
