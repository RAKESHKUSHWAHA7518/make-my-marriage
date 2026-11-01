import { test } from "node:test";
import assert from "node:assert/strict";
import { searchPlaces, placeDetails, placesConfiguration } from "../src/infrastructure/google-places/client";
import { discoveryQuerySchema, placeQuerySchema } from "../src/modules/vendors/discovery-schema";

test("Google Places adapter bounds data, costs, links and errors without live requests", async t => {
  const original = globalThis.fetch, env = { ...process.env };
  process.env.GOOGLE_PLACES_API_KEY = "synthetic-test-key"; process.env.GOOGLE_PLACES_TERMS_URL = "https://example.test/terms"; process.env.GOOGLE_PLACES_PRIVACY_URL = "https://example.test/privacy";
  const input = { category: "photography" as const, location: "Test city" };
  const place = { id: "Test_place-1", displayName: { text: "Test photographer" }, formattedAddress: "Test address", rating: 4.5, userRatingCount: 0, googleMapsUri: "https://maps.google.com/?cid=1", internationalPhoneNumber: "+91 12345", websiteUri: "https://example.test", attributions: [{ provider: "Test data provider", providerUri: "https://example.test/source" }], secret: "must-not-leak", reviews: [{ text: "not requested" }] };
  try {
    await t.test("configuration and strict query validation fail closed", async () => {
      assert.equal(placesConfiguration().available, true);
      for (const value of [undefined, "", "javascript:alert(1)", "http://example.test", "https://name:pass@example.test"]) {
        if (value === undefined) delete process.env.GOOGLE_PLACES_TERMS_URL; else process.env.GOOGLE_PLACES_TERMS_URL = value;
        assert.equal(placesConfiguration().available, false);
      }
      let calls = 0; globalThis.fetch = async () => { calls++; throw Error(); }; await assert.rejects(searchPlaces(input), { status: 503 }); assert.equal(calls, 0);
      process.env.GOOGLE_PLACES_TERMS_URL = "https://example.test/terms";
      for (const extra of [{ fields: "*" }, { location: " " }, { category: "unknown" }, { location: "test\ncity" }, { location: "a".repeat(201) }]) assert.equal(discoveryQuerySchema.safeParse({ ...input, ...extra }).success, false);
      assert.equal(placeQuerySchema.safeParse({ placeId: "../secrets?key=1" }).success, false);
    });
    await t.test("search uses a fixed ten-result mask and no cache; drops unsupported fields", async () => {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, "https://places.googleapis.com/v1/places:searchText"); assert.equal(options?.cache, "no-store"); assert.equal(options?.redirect, "error");
        const headers = options?.headers as Record<string, string>; assert.equal(headers["X-Goog-Api-Key"], "synthetic-test-key"); assert(!headers["X-Goog-FieldMask"].includes("*")); assert(!headers["X-Goog-FieldMask"].includes("reviews"));
        assert.deepEqual(JSON.parse(options!.body as string), { textQuery: "wedding photographers in Test city", pageSize: 10, languageCode: "en", pageToken: "opaque-page" });
        return Response.json({ places: [place], nextPageToken: "next" });
      };
      const value = await searchPlaces(input, "opaque-page"); assert.equal(value.data[0].reviewCount, 0); assert.equal(value.nextPageToken, "next");
      assert.equal(value.data[0].attributions[0].name, "Test data provider"); assert(!JSON.stringify(value).includes("must-not-leak")); assert(!("reviews" in value.data[0]));
    });
    await t.test("details have a fixed endpoint/mask, allow safe links and preserve attribution", async () => {
      globalThis.fetch = async (url, options) => { assert.equal(url, "https://places.googleapis.com/v1/places/Test_place-1?languageCode=en"); assert.equal(options?.method, "GET"); assert.match((options!.headers as Record<string, string>)["X-Goog-FieldMask"], /internationalPhoneNumber/); return Response.json(place); };
      const value = await placeDetails(place.id); assert.equal(value.phone, "+91 12345"); assert.equal(value.mapsUrl, place.googleMapsUri); assert.equal(value.websiteUrl, "https://example.test/");
      globalThis.fetch = async () => Response.json({ ...place, websiteUri: "javascript:alert(1)", googleMapsUri: "https://evil.example/test", internationalPhoneNumber: "javascript:bad" });
      const safe = await placeDetails(place.id); assert.equal(safe.websiteUrl, undefined); assert.equal(safe.mapsUrl, undefined); assert.equal(safe.phone, undefined);
    });
    await t.test("empty results are distinct from malformed provider data", async () => {
      globalThis.fetch = async () => Response.json({}); assert.deepEqual(await searchPlaces(input), { data: [], nextPageToken: undefined });
      for (const bad of [{ places: [{ id: "bad" }] }, { places: Array(11).fill(place) }, { places: [{ ...place, attributions: [{ provider: "Required", providerUri: "javascript:bad" }] }] }]) {
        globalThis.fetch = async () => Response.json(bad); await assert.rejects(searchPlaces(input), { code: "DISCOVERY_UNAVAILABLE" });
      }
      globalThis.fetch = async () => Response.json({ ...place, id: "other" }); await assert.rejects(placeDetails(place.id), { status: 503 });
    });
    await t.test("provider quotas, timeouts and failures are redacted", async () => {
      for (const [status, expected] of [[429, 429], [403, 503], [500, 503], [404, 404]]) {
        globalThis.fetch = async () => new Response("private upstream diagnostics", { status }); await assert.rejects(placeDetails(place.id), e => { assert.equal((e as { status: number }).status, expected); assert(!String(e).includes("diagnostics")); return true; });
      }
      globalThis.fetch = async () => { throw new DOMException("secret endpoint", "TimeoutError"); }; await assert.rejects(searchPlaces(input), { code: "DISCOVERY_TIMEOUT" });
      globalThis.fetch = async () => new Response("x".repeat(524289)); await assert.rejects(searchPlaces(input), { status: 503 });
    });
  } finally { globalThis.fetch = original; for (const key of ["GOOGLE_PLACES_API_KEY", "GOOGLE_PLACES_TERMS_URL", "GOOGLE_PLACES_PRIVACY_URL"]) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; } }
});
