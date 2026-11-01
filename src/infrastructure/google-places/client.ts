import "server-only";
import { z } from "zod";
import { AccountError } from "@/modules/identity/security";
import { vendorCategoryLabels } from "@/modules/vendors/schema";
import type { DiscoveredPlace, DiscoveryQuery } from "@/modules/vendors/discovery-schema";

const endpoint = "https://places.googleapis.com/v1/places";
const searchFields = "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.attributions,nextPageToken";
const detailFields = "id,displayName,formattedAddress,primaryTypeDisplayName,rating,userRatingCount,businessStatus,googleMapsUri,internationalPhoneNumber,websiteUri,attributions";
const unavailable = () => new AccountError(503, "DISCOVERY_UNAVAILABLE", "Business discovery is temporarily unavailable. You can still add a vendor manually.");
function webUrl(value: string | undefined, maps = false) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    if (maps && !(url.protocol === "https:" && ["maps.google.com", "www.google.com", "google.com", "maps.google.co.in", "maps.app.goo.gl"].includes(url.hostname))) return undefined;
    return url.href;
  } catch { return undefined; }
}
function publicPolicy(value: string | undefined) {
  const url = webUrl(value);
  return url?.startsWith("https://") ? url : undefined;
}
export function placesConfiguration() {
  const termsUrl = publicPolicy(process.env.GOOGLE_PLACES_TERMS_URL), privacyUrl = publicPolicy(process.env.GOOGLE_PLACES_PRIVACY_URL);
  return { available: !!(process.env.GOOGLE_PLACES_API_KEY?.trim() && termsUrl && privacyUrl), termsUrl: termsUrl ?? null, privacyUrl: privacyUrl ?? null };
}
const text = z.string().max(2000);
const placeSchema = z.object({
  id: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/), displayName: z.object({ text: z.string().min(1).max(500) }),
  formattedAddress: text.optional(), primaryTypeDisplayName: z.object({ text }).optional(),
  rating: z.number().min(0).max(5).optional(), userRatingCount: z.number().int().nonnegative().optional(),
  businessStatus: z.enum(["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY", "FUTURE_OPENING"]).optional(),
  googleMapsUri: text.optional(), internationalPhoneNumber: z.string().max(100).optional(), websiteUri: text.optional(),
  attributions: z.array(z.object({ provider: z.string().min(1).max(500), providerUri: text })).max(50).default([]),
});
function project(value: unknown): DiscoveredPlace {
  const p = placeSchema.parse(value);
  const attributions = p.attributions.map(a => {
    const uri = webUrl(a.providerUri); if (!uri) throw unavailable();
    return { name: a.provider, uri };
  });
  return { placeId: p.id, name: p.displayName.text, address: p.formattedAddress, typeLabel: p.primaryTypeDisplayName?.text,
    rating: p.rating, reviewCount: p.userRatingCount, businessStatus: p.businessStatus,
    mapsUrl: webUrl(p.googleMapsUri, true), phone: p.internationalPhoneNumber && /^\+?[\d\s().-]+$/.test(p.internationalPhoneNumber) ? p.internationalPhoneNumber : undefined,
    websiteUrl: webUrl(p.websiteUri), attributions };
}
async function call(url: string, fields: string, body?: object): Promise<unknown> {
  if (!placesConfiguration().available) throw unavailable();
  try {
    const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!, "X-Goog-FieldMask": fields },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) throw new AccountError(429, "PROVIDER_RATE_LIMITED", "Business search is busy. Please wait a minute before trying again.");
      if (response.status === 404) throw new AccountError(404, "PLACE_UNAVAILABLE", "This business listing is no longer available.");
      throw unavailable();
    }
    const reader = response.body?.getReader(); if (!reader) throw unavailable();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 524288) { await reader.cancel(); throw unavailable(); } chunks.push(part.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof AccountError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new AccountError(504, "DISCOVERY_TIMEOUT", "Business search took too long. Please retry.");
    throw unavailable();
  }
}
const categorySearch = { venue: "wedding venues", catering: "wedding caterers", photography: "wedding photographers", decoration: "wedding decorators", mehendi: "mehendi artists", priest: "wedding priests pandits", clothing: "wedding clothing stores", other: "wedding services" };
export async function searchPlaces(input: DiscoveryQuery, pageToken?: string) {
  try {
    const raw = z.object({ places: z.array(z.unknown()).max(10).default([]), nextPageToken: z.string().max(4096).optional() }).parse(await call(`${endpoint}:searchText`, searchFields,
      { textQuery: `${categorySearch[input.category] ?? vendorCategoryLabels[input.category]} in ${input.location}`, pageSize: 10, languageCode: "en", ...(pageToken ? { pageToken } : {}) }));
    return { data: raw.places.map(project), nextPageToken: raw.nextPageToken };
  } catch (error) { if (error instanceof AccountError) throw error; throw unavailable(); }
}
export async function placeDetails(placeId: string) {
  try { const data = project(await call(`${endpoint}/${encodeURIComponent(placeId)}?languageCode=en`, detailFields)); if (data.placeId !== placeId) throw unavailable(); return data; }
  catch (error) { if (error instanceof AccountError) throw error; throw unavailable(); }
}
