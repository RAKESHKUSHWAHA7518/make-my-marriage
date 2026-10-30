import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

const configurationSchema = z.object({
  cloudName: z.string().regex(/^[A-Za-z0-9_-]+$/),
  apiKey: z.string().regex(/^\d+$/),
  apiSecret: z.string().min(1),
});
export function mediaConfiguration() {
  const parsed = configurationSchema.safeParse({ cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET });
  if (!parsed.success) throw new Error("Cloudinary configuration is missing or invalid");
  return parsed.data;
}

/** Cloudinary API signing protocol, not HMAC. Never accept arbitrary client parameters. */
function signature(fields: Record<string, string>, secret: string) {
  return createHash("sha256").update(Object.keys(fields).sort().map(key => `${key}=${fields[key]}`).join("&") + secret).digest("hex");
}
const publicIdSchema = z.string().regex(/^mmm\/[a-f0-9]{24}\/gallery\/[a-f0-9]{32}$/);
export const galleryMaxBytes = 20_000_000;
export const galleryFormats = ["jpg", "png", "webp"] as const;
export class InvalidPhotoError extends Error {}

/** Only server-generated IDs belong here; authorization/quota reservation precede this call. */
export function signedGalleryUpload(publicId: string, now = new Date()) {
  publicIdSchema.parse(publicId);
  const config = mediaConfiguration();
  const fields = { public_id: publicId, timestamp: String(Math.floor(now.getTime() / 1000)), type: "authenticated", overwrite: "false", allowed_formats: galleryFormats.join(",") };
  return { method: "POST" as const, url: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, fields: { ...fields, api_key: config.apiKey, signature: signature(fields, config.apiSecret) } };
}

async function adminRequest(path: string): Promise<Response> {
  const config = mediaConfiguration();
  try {
    return await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${path}`, { cache: "no-store", redirect: "error", headers: { Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}` }, signal: AbortSignal.timeout(15000) });
  } catch { throw new Error("Cloudinary request unavailable"); }
}
export async function checkMediaConnection() {
  const response = await adminRequest("ping");
  if (!response.ok) throw new Error("Cloudinary credential check failed");
  return { connected: true as const };
}

const providerAssetSchema = z.object({
  asset_id: z.string().min(1), public_id: publicIdSchema,
  resource_type: z.literal("image"), type: z.literal("authenticated"),
  format: z.enum(galleryFormats), bytes: z.number().int().positive().max(galleryMaxBytes),
  width: z.number().int().positive(), height: z.number().int().positive(),
  version: z.number().int().positive(), pages: z.number().int().positive().optional(),
});
/** Accept only independently fetched provider metadata, never the browser's upload result. */
export function verifiedGalleryMetadata(raw: unknown, expectedPublicId: string) {
  publicIdSchema.parse(expectedPublicId);
  const parsed = providerAssetSchema.safeParse(raw);
  if (!parsed.success || parsed.data.public_id !== expectedPublicId || (parsed.data.pages ?? 1) !== 1) throw new InvalidPhotoError("Photo verification failed");
  const value = parsed.data;
  return { providerAssetId: value.asset_id, publicId: value.public_id, resourceType: value.resource_type, format: value.format, bytes: value.bytes, width: value.width, height: value.height, providerVersion: value.version };
}

/** Destroy only an application-owned target, across resource types to clean endpoint misuse too. */
export async function deleteGalleryTarget(publicId: string) {
  publicIdSchema.parse(publicId);
  const config = mediaConfiguration();
  for (const resourceType of ["image", "video", "raw"]) {
    const fields = { public_id: publicId, type: "authenticated", invalidate: "true", timestamp: String(Math.floor(Date.now() / 1000)) };
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/destroy`, { method: "POST", redirect: "error", body: new URLSearchParams({ ...fields, api_key: config.apiKey, signature: signature(fields, config.apiSecret) }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Cloudinary cleanup unavailable");
    const result = await response.json();
    if (!["ok", "not found"].includes(result.result)) throw new Error("Cloudinary cleanup unconfirmed");
  }
}
export async function inspectGalleryAsset(expectedPublicId: string) {
  publicIdSchema.parse(expectedPublicId);
  const response = await adminRequest(`resources/image/authenticated/${encodeURIComponent(expectedPublicId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Cloudinary verification unavailable");
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error("Cloudinary verification unavailable"); }
  return verifiedGalleryMetadata(data, expectedPublicId);
}

/** Server-only upstream URL; never return it in API JSON or redirect the browser to it. */
export function galleryDeliveryUrl(publicId: string, version: number, variant: "thumbnail" | "gallery") {
  publicIdSchema.parse(publicId); z.number().int().positive().parse(version);
  if (variant !== "thumbnail" && variant !== "gallery") throw new Error("Unsupported media variant");
  const config = mediaConfiguration();
  const transform = variant === "thumbnail" ? "c_limit,w_480,h_480,f_jpg,q_80,fl_strip_profile" : "c_limit,w_1920,h_1920,f_jpg,q_85,fl_strip_profile";
  const path = `${transform}/v${version}/${publicId}.jpg`;
  const signed = createHash("sha256").update(path + config.apiSecret).digest("base64url").slice(0, 8);
  return `https://res.cloudinary.com/${config.cloudName}/image/authenticated/s--${signed}--/${path}`;
}
