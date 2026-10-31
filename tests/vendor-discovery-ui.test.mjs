import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const schema = require("../src/modules/vendors/discovery-schema.ts"), categories = require("../src/modules/vendors/schema.ts");
function harness(respond) {
  const refs = [], states = [], calls = []; let r = 0, s = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useEffect() {}, useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = v; }]; } };
  const context = { React, exports: {}, AbortController, URLSearchParams, requestAnimationFrame(fn) { fn(); }, fetch: async (url, options) => { calls.push({ url, options }); return respond(url, options); },
    require(id) { return id === "react" ? React : id === "next/link" || id === "next/image" ? "a" : id.includes("vendor-form") ? { VendorForm: "vendor-form" } : id.includes("wedding-icon") ? { WeddingIcon: "svg" } : id.includes("discovery-schema") ? schema : id.includes("/schema") ? categories : (() => { throw Error(id); })(); } };
  const source = ts.transpileModule(readFileSync("src/components/vendors/vendor-discovery.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, context);
  const props = { weddingId: "a".repeat(24), available: true, archived: false, termsUrl: "https://example.test/terms", privacyUrl: "https://example.test/privacy" };
  function render() { r = 0; s = 0; return context.exports.VendorDiscovery(props); }
  function nodes(value, out = []) { if (Array.isArray(value)) value.forEach(v => nodes(v, out)); else if (value && typeof value === "object" && "props" in value) { out.push(value); nodes(value.props.children, out); } return out; }
  const all = () => nodes(render()), text = value => typeof value === "string" || typeof value === "number" ? String(value) : Array.isArray(value) ? value.map(text).join("") : value?.props ? text(value.props.children) : "";
  const button = label => { const node = all().find(n => n.type === "button" && text(n).includes(label)); assert(node, label); return node; };
  function fill() { all().find(n => n.type === "select").props.onChange({ target: { value: "venue" } }); all().find(n => n.type === "input").props.onChange({ target: { value: "Test city" } }); }
  const submit = () => all().find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  return { render, all, text, button, fill, submit, calls, props };
}
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const page = { data: [{ placeId: "Test_place", name: "Test business", attributions: [] }], pagination: { nextCursor: "signed-test-cursor" } };
const settle = () => new Promise(resolve => setImmediate(resolve));
test("invalid search never calls the API; controls use explicit submit", () => {
  const h = harness(() => { throw Error(); }); h.submit(); assert.equal(h.calls.length, 0); assert.match(h.text(h.render()), /Choose a vendor category/); assert.match(h.text(h.render()), /Enter a city or area/); h.fill(); assert.equal(h.calls.length, 0);
});
test("duplicate submissions are blocked and next page uses the original search", async () => {
  let release; const h = harness(() => new Promise(resolve => { release = resolve; })); h.fill(); h.submit(); h.submit(); assert.equal(h.calls.length, 1);
  release(response(page)); await settle(); const next = h.button("Next results"); next.props.onClick(); assert.equal(h.calls.length, 2); assert.match(h.calls[1].url, /cursor=signed-test-cursor/); assert.match(h.calls[1].url, /location=Test\+city/); assert.equal(h.calls[0].options.headers["X-MMM-CSRF"], "1");
});
test("reset aborts and ignores even a late successful response", async () => {
  let release; const h = harness(() => new Promise(resolve => { release = resolve; })); h.fill(); h.submit(); h.button("Clear / Reset").props.onClick(); assert.equal(h.calls[0].options.signal.aborted, true);
  release(response(page)); await settle(); assert(!h.text(h.render()).includes("1 business on this page")); assert.equal(h.all().find(n => n.type === "input").props.value, "");
});
test("details cannot reappear after returning to results", async () => {
  let release; const h = harness(url => url.includes("/details") ? new Promise(resolve => { release = resolve; }) : Promise.resolve(response(page)));
  h.fill(); h.submit(); await settle(); h.button("View business details").props.onClick(); h.button("Back to results").props.onClick();
  release(response({ data: { ...page.data[0], name: "Late detail" } })); await settle(); assert(!h.text(h.render()).includes("Business details")); assert.match(h.text(h.render()), /1 business on this page/);
});
test("429/network failures preserve entered values and retry the same request", async () => {
  let attempt = 0; const h = harness(async () => { attempt++; if (attempt === 1) throw Error("network"); if (attempt === 2) return response({ error: { message: "Please wait" } }, 429); return response(page); });
  h.fill(); h.submit(); await settle(); h.button("Retry").props.onClick(); await settle(); h.button("Retry").props.onClick(); await settle(); assert(h.calls.every(c => c.url === h.calls[0].url)); assert.equal(h.all().find(n => n.type === "input").props.value, "Test city"); assert.match(h.text(h.render()), /1 business on this page/);
});
test("unavailable/archive disables search and session expiry clears provider results", async () => {
  const h = harness(async url => url.includes("/details") ? response({ error: { message: "Sign in" } }, 401) : response(page));
  h.props.available = false; assert.equal(h.all().find(n => n.type === "fieldset").props.disabled, true); assert.match(h.text(h.render()), /temporarily unavailable/);
  h.props.available = true; h.props.archived = true; assert.equal(h.all().find(n => n.type === "fieldset").props.disabled, true);
  h.props.archived = false; h.fill(); h.submit(); await settle(); h.button("View business details").props.onClick(); await settle(); h.button("Back to results").props.onClick(); assert(!h.text(h.render()).includes("1 business on this page"));
});

test("save screen receives only the selected reference/category and never copies provider fields", async () => {
  const h = harness(async url => response(url.includes("/details") ? { data: { ...page.data[0], phone: "+91 12345", address: "Provider address" } } : page));
  h.props.canSave = true; h.fill(); h.submit(); await settle(); h.button("View business details").props.onClick(); await settle(); h.button("Save to wedding").props.onClick();
  assert.match(h.text(h.render()), /Save discovered vendor/); const form = h.all().find(n => n.type === "vendor-form"); assert(form);
  assert.equal(form.props.googlePlaceId, "Test_place"); assert.equal(form.props.suggestedCategory, "venue"); assert.equal(form.props.initial, undefined); assert.equal(form.props.name, undefined); assert.equal(form.props.contact, undefined);
  assert.equal(h.all().some(n => n.type === "button" && h.text(n).includes("Back to results")), false);
});
test("already-saved details offer their existing record instead of another save form", async () => {
  const h = harness(async url => response(url.includes("/details") ? { data: { ...page.data[0], savedVendor: { id: "c".repeat(24), status: "removed" } } } : page));
  h.props.canSave = true; h.fill(); h.submit(); await settle(); h.button("View business details").props.onClick(); await settle();
  assert.equal(h.all().some(n => n.type === "button" && h.text(n).includes("Save to wedding")), false); assert(h.all().some(n => n.props.href === `/wedding/vendors/${"c".repeat(24)}` && h.text(n).includes("View removed vendor")));
});
