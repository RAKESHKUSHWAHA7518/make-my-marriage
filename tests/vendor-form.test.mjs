import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), schema = require("../src/modules/vendors/schema.ts");
function harness(responses, mode = "create") {
  const refs = [], states = [], requests = [], destinations = []; let r = 0, s = 0, serial = 0;
  const initial = ["create", "google"].includes(mode) ? undefined : { id: "a".repeat(24), name: "Saved vendor", source: mode === "google-edit" ? "GOOGLE_PLACES" : "MANUAL", ...(mode === "google-edit" ? { googlePlaceId: "Test_place" } : {}), category: "venue", version: 3, status: "active", eventIds: [], events: [] };
  const values = { name: "Family caterer", category: "catering", person: "Coordinator", phone: "", email: "", address: "", notes: "", eventIds: [] };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = v; }]; } };
  const context = { React, exports: {}, Error, AbortSignal, window: { location: { replace: path => destinations.push(path) } }, requestAnimationFrame() {}, crypto: { randomUUID: () => `immutable-vendor-key-${++serial}` }, FormData: class { get(name) { return values[name] ?? ""; } getAll(name) { return values[name] ?? []; } },
    require(id) { return id.includes("use-unsaved-navigation") ? { useUnsavedNavigation() {} } : id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace: path => destinations.push(path), refresh() {} }) } : id === "next/link" ? "a" : schema; },
    async fetch(url, options) { requests.push({ url, ...options }); const next = responses.shift(); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; },
  };
  const remove = mode === "remove", component = remove ? "RemoveVendor" : "VendorForm";
  runInNewContext(ts.transpileModule(readFileSync(`src/components/vendors/${remove ? "remove-vendor" : "vendor-form"}.tsx`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { r = 0; s = 0; return context.exports[component](remove ? { weddingId: "b".repeat(24), vendor: initial } : { weddingId: "b".repeat(24), initial, events: [], ...(mode === "google" ? { googlePlaceId: "Test_place", suggestedCategory: "photography" } : {}) }); }
  function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of node.props?.children?.flat(Infinity) ?? []) { const found = find(child, predicate); if (found) return found; } return null; }
  function submit() { const node = render(); return remove ? find(node, n => n.type === "button" && n.props.className === "button button-primary").props.onClick() : find(node, n => n.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} }); }
  return { render, submit, find, values, requests, destinations, initial };
}
test("lost save response and 429 retain immutable contacts/event choices and the same key", async () => {
  const h = harness([Error("lost"), { status: 429, body: {} }, { status: 201, body: { data: { id: "a".repeat(24) } } }]);
  await h.submit(); h.values.person = "Changed after submission"; h.values.eventIds.push("c".repeat(24)); await h.submit(); await h.submit();
  assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"]));
  const body = JSON.parse(h.requests[0].body); assert.equal(body.contact.person, "Coordinator"); assert.deepEqual(body.eventIds, []); assert.equal(body.source, "MANUAL"); assert.deepEqual(h.destinations, ["/wedding/vendors/" + "a".repeat(24)]);
});
test("invalid contacts and missing name/category are rejected before requests", async () => {
  const h = harness([]); h.values.name = ""; await h.submit(); h.values.name = "Test"; h.values.email = "invalid"; await h.submit(); h.values.email = ""; h.values.phone = "letters"; await h.submit(); assert.equal(h.requests.length, 0);
});
test("edit clears optional contacts/notes explicitly and never changes source", async () => {
  const h = harness([{ status: 200, body: { data: { id: "a".repeat(24) } } }], "edit"); h.values.person = ""; await h.submit();
  const body = JSON.parse(h.requests[0].body); assert.equal(body.contact, null); assert.equal(body.notes, null); assert.deepEqual(body.eventIds, []); assert.equal(body.expectedVersion, 3); assert.equal("source" in body, false); assert.equal(h.requests[0].method, "PATCH");
});
test("conflict, removed access and expired session block blind resubmission", async () => {
  for (const status of [401, 403, 404, 409]) { const h = harness([{ status, body: { error: { message: "Review saved details" } } }], "edit"); await h.submit(); await h.submit(); assert.equal(h.requests.length, 1); assert.equal(h.destinations.length, 0); assert.equal(h.values.person, "Coordinator"); }
});
test("definitive validation failure permits a corrected save with a new key", async () => {
  const h = harness([{ status: 422, body: { error: { code: "EVENT_UNAVAILABLE", message: "Choose another event" } } }, { status: 201, body: { data: { id: "a".repeat(24) } } }]); await h.submit(); h.values.name = "Corrected"; await h.submit(); assert.notEqual(h.requests[0].headers["Idempotency-Key"], h.requests[1].headers["Idempotency-Key"]);
});
test("uncertain removal retains the original version/key across rerenders and 429", async () => {
  const h = harness([Error("lost"), { status: 429, body: {} }, { status: 200, body: { data: { id: "a".repeat(24), status: "removed" } } }], "remove"); await h.submit(); h.initial.version = 9; await h.submit(); await h.submit(); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"])); assert.equal(JSON.parse(h.requests[0].body).expectedVersion, 3);
});

test("Google save keeps optional label empty and retries the original place/private payload", async () => {
  const h = harness([Error("lost"), { status: 429, body: {} }, { status: 201, body: { data: { id: "a".repeat(24) } } }], "google");
  const nameField = h.find(h.render(), n => n.type === "input" && n.props.name === "name"); assert.equal(nameField.props.defaultValue, ""); assert.equal(nameField.props.required, false);
  h.values.name = ""; await h.submit(); h.values.name = "Changed after uncertainty"; await h.submit(); await h.submit();
  const body = JSON.parse(h.requests[0].body); assert.equal(body.source, "GOOGLE_PLACES"); assert.equal(body.googlePlaceId, "Test_place"); assert.equal(body.name, undefined); assert.equal(body.contact.person, "Coordinator");
  assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"]));
});
test("Google edits cannot replace place identity and may clear their private label", async () => {
  const h = harness([{ status: 200, body: { data: { id: "a".repeat(24) } } }], "google-edit"); h.values.name = ""; await h.submit(); const body = JSON.parse(h.requests[0].body);
  assert.equal(body.source, undefined); assert.equal(body.googlePlaceId, undefined); assert.equal(body.name, schema.googleVendorFallbackName); assert.equal(body.expectedVersion, 3);
});
test("duplicate Google save links to the existing record without blind retries", async () => {
  const h = harness([{ status: 409, body: { error: { code: "VENDOR_ALREADY_SAVED", message: "Already saved", existingVendorId: "c".repeat(24) } } }], "google"); await h.submit(); await h.submit(); assert.equal(h.requests.length, 1);
  assert(h.find(h.render(), n => n.props?.href === `/wedding/vendors/${"c".repeat(24)}`)); assert.equal(h.values.person, "Coordinator");
});
