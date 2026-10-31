import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { placeDetails, placesConfiguration, searchPlaces } from "@/infrastructure/google-places/client";
import { AccountError, digest } from "@/modules/identity/security";
import { rateLimit, type User } from "@/modules/identity/service";
import { membershipFor } from "@/modules/weddings/service";
import { discoveryQuerySchema, placeQuerySchema, type DiscoveredPlace, type DiscoveryQuery } from "./discovery-schema";

async function withSavedReferences(weddingId: string, places: DiscoveredPlace[]) {
  const db = await getDatabase();
  const saved = places.length ? await db.collection("vendors").find({ weddingId: new ObjectId(weddingId), source: "GOOGLE_PLACES", googlePlaceId: { $in: places.map(p => p.placeId) } }, { projection: { googlePlaceId: 1, status: 1 } }).limit(10).toArray() : [];
  return places.map(p => { const row = saved.find(v => v.googlePlaceId === p.placeId); return row ? { ...p, savedVendor: { id: row._id.toString(), status: row.status as "active" | "removed" } } : p; });
}

function cursorKey() { const key = process.env.RATE_LIMIT_HMAC_KEY; if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new AccountError(503, "DISCOVERY_UNAVAILABLE", "Business discovery is temporarily unavailable."); return Buffer.from(key, "hex"); }
function cursorScope(user: User, weddingId: string, input: DiscoveryQuery) { return digest(JSON.stringify([user._id.toString(), weddingId, input.category, input.location])); }
function decodeCursor(cursor: string, scope: string) {
  try {
    const [body, signature, extra] = cursor.split("."); if (extra || !body || !signature) throw Error();
    const expected = createHmac("sha256", cursorKey()).update(body).digest(), supplied = Buffer.from(signature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw Error();
    const value = JSON.parse(Buffer.from(body, "base64url").toString());
    if (value.scope !== scope || !Number.isInteger(value.expires) || value.expires <= Date.now() || !Number.isInteger(value.page) || value.page < 2 || value.page > 3 || typeof value.token !== "string" || !value.token || value.token.length > 4096) throw Error();
    return value as { token: string; page: number; expires: number };
  } catch { throw new AccountError(400, "INVALID_CURSOR", "This results page has expired or changed. Search again."); }
}
async function authorized(user: User, weddingId: string) {
  const db = await getDatabase(), member = await membershipFor(user);
  if (!member || member.status !== "active" || !["ADMIN", "MANAGER"].includes(member.role) || member.weddingId.toString() !== weddingId) throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
  if (!await db.collection("users").findOne({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $type: "date" } })) throw new AccountError(403, "FORBIDDEN", "Please sign in with a verified account.");
  const wedding = await db.collection("weddings").findOne({ _id: member.weddingId }, { projection: { state: 1 } });
  if (!wedding) throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
  if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Vendor discovery is unavailable.");
}
export async function discoverVendors(user: User, weddingId: string, raw: unknown, details = false) {
  const input = details ? placeQuerySchema.parse(raw) : discoveryQuerySchema.parse(raw);
  await authorized(user, weddingId);
  if (!placesConfiguration().available) throw new AccountError(503, "DISCOVERY_UNAVAILABLE", "Business discovery is temporarily unavailable. You can still add a vendor manually.");
  const query = input as DiscoveryQuery, scope = !details ? cursorScope(user, weddingId, query) : "";
  const previous = !details && query.cursor ? decodeCursor(query.cursor, scope) : undefined;
  // Persistent limits bound both per-organizer traffic and aggregate wedding spend.
  await rateLimit("vendor-discovery-user", user._id.toString(), 30);
  await rateLimit("vendor-discovery-wedding", weddingId, 100);
  if (details) { const data = (await withSavedReferences(weddingId, [await placeDetails((input as { placeId: string }).placeId)]))[0]; await authorized(user, weddingId); return { data }; }
  const page = await searchPlaces(query, previous?.token);
  const data = await withSavedReferences(weddingId, page.data);
  await authorized(user, weddingId); // Do not release provider data to access removed during a slow request.
  const pageNumber = previous?.page ?? 1;
  let nextCursor: string | null = null;
  if (page.nextPageToken && pageNumber < 3) {
    const body = Buffer.from(JSON.stringify({ scope, token: page.nextPageToken, page: pageNumber + 1, expires: previous?.expires ?? Date.now() + 900000 })).toString("base64url");
    nextCursor = `${body}.${createHmac("sha256", cursorKey()).update(body).digest("base64url")}`;
  }
  return { data, pagination: { nextCursor } };
}
