import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
function harness(respond) {
  const refs = [], states = [], calls = []; let r = 0, s = 0, cleanup;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useEffect(fn) { if (!cleanup) cleanup = fn(); }, useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = v; }]; } };
  const context = { React, exports: {}, AbortController, URLSearchParams, require: id => id === "react" ? React : id === "next/link" ? "a" : { PlaceInformation: "place-information" }, fetch: async (url, options) => { calls.push({ url, options }); return respond(url, options); } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/vendors/saved-place-details.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  const props = { weddingId: "a".repeat(24), placeId: "Test_place", archived: false, available: true, termsUrl: "https://example.test/terms", privacyUrl: "https://example.test/privacy" };
  const flatten = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(flatten) : [node, ...flatten(node.props?.children)];
  function render() { r = 0; s = 0; return flatten(context.exports.SavedPlaceDetails(props)); }
  return { render, props, calls, load: () => render().find(n => n.type === "button").props.onClick(), unmount: () => cleanup() };
}
const response = (data, status = 200) => ({ ok: status < 300, status, json: async () => data });
const settle = () => new Promise(resolve => setImmediate(resolve));
test("saved references never auto-fetch; explicit requests are locked and attributed separately", async () => {
  let release; const h = harness(() => new Promise(resolve => { release = resolve; })); h.render(); assert.equal(h.calls.length, 0); h.load(); h.load(); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.cache, "no-store"); assert.equal(h.calls[0].options.headers["X-MMM-CSRF"], "1"); release(response({ data: { placeId: "Test_place", name: "Transient Google name", attributions: [] } })); await settle(); assert(h.render().some(n => n.type === "place-information"));
});
test("unmount aborts and ignores a late provider response", async () => {
  let release; const h = harness(() => new Promise(resolve => { release = resolve; })); h.load(); h.unmount(); assert.equal(h.calls[0].options.signal.aborted, true); release(response({ data: { placeId: "Test_place", name: "Late" } })); await settle(); assert.equal(h.render().some(n => n.type === "place-information"), false);
});
test("archive/missing configuration make no calls; wrong-place/errors require explicit retry", async () => {
  let attempt = 0; const h = harness(async () => ++attempt === 1 ? response({ data: { placeId: "Wrong_place" } }) : response({ error: { message: "Please sign in" } }, 401));
  h.props.archived = true; assert.equal(h.render().some(n => n.type === "button"), false); h.props.archived = false; h.props.available = false; assert.equal(h.render().some(n => n.type === "button"), false); assert.equal(h.calls.length, 0);
  h.props.available = true; h.load(); await settle(); assert.equal(h.render().some(n => n.type === "place-information"), false); assert.equal(h.calls.length, 1); h.load(); await settle(); assert(h.render().some(n => n.props?.href === "/login")); assert.equal(h.calls.length, 2);
});
