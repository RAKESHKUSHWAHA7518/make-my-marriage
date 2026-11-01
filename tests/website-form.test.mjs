import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), schema = require("../src/modules/website/schema.ts");
function harness(responses, readOnly = false) {
  const refs = [], states = [], requests = []; let ri = 0, si = 0, serial = 0;
  const editor = { draft: { coupleNames: "QA names", intro: "", selectedEventIds: [] }, draftVersion: 1, enabled: true, events: [], covers: { data: [], nextCursor: null } };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef(v) { const i = ri++; return refs[i] ?? (refs[i] = { current: v }); }, useState(v) { const i = si++; if (!(i in states)) states[i] = v; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; } };
  const context = { React, exports: {}, Error, AbortSignal, requestAnimationFrame() {}, crypto: { randomUUID: () => `website-immutable-key-${++serial}` }, require: id => id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ push() {} }) } : id.includes("use-unsaved") ? { useUnsavedNavigation() {} } : id.includes("website/schema") ? schema : id.includes("events/schema") ? { eventDate: () => "Date" } : "component", async fetch(url, options) { requests.push({ url, ...options }); const next = responses.shift(); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/website/website-form.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { ri = 0; si = 0; return context.exports.WebsiteForm({ editor, weddingId: "a".repeat(24), timezone: "Asia/Kolkata", readOnly }); }
  function walk(n) { if (!n || typeof n !== "object") return []; if (Array.isArray(n)) return n.flatMap(walk); return [n, ...walk(n.props?.children)]; }
  const find = predicate => walk(render()).find(predicate);
  return { editor, requests, render, find, submit: () => find(n => n.type === "form").props.onSubmit({ preventDefault() {} }), name: value => find(n => n.type === "input" && n.props.maxLength === 403).props.onChange({ target: { value } }) };
}
test("lost response and 429 retain immutable website draft/version/key until confirmed", async () => {
  const h = harness([Error("lost"), { status: 429, body: {} }, { status: 200, body: { data: { draftVersion: 2, draft: { coupleNames: "QA names", intro: "", selectedEventIds: [] } } } }]);
  await h.submit(); assert(h.find(n => n.type === "fieldset").props.disabled); h.name("Changed after loss"); await h.submit(); await h.submit();
  assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"])); assert.equal(JSON.parse(h.requests[0].body).expectedDraftVersion, 1); assert(!h.find(n => n.type === "fieldset").props.disabled);
});
test("validation prevents requests and definitive failure allows correction with a fresh key", async () => {
  const h = harness([{ status: 422, body: { error: { message: "Check fields" } } }, { status: 200, body: { data: { draftVersion: 2, draft: { coupleNames: "Corrected", intro: "", selectedEventIds: [] } } } }]);
  h.name(""); await h.submit(); assert.equal(h.requests.length, 0); h.name("First"); await h.submit(); h.name("Corrected"); await h.submit(); assert.notEqual(h.requests[0].headers["Idempotency-Key"], h.requests[1].headers["Idempotency-Key"]);
});
test("stale/account errors block blind saves and archive/readiness disable mutation", async () => {
  for (const status of [401, 403, 404, 409]) { const h = harness([{ status, body: { error: { message: "Review latest" } } }]); await h.submit(); await h.submit(); assert.equal(h.requests.length, 1); assert(h.find(n => n.type === "fieldset").props.disabled); }
  const archived = harness([], true); await archived.submit(); assert.equal(archived.requests.length, 0);
  const pending = harness([]); pending.editor.enabled = false; await pending.submit(); assert.equal(pending.requests.length, 0);
});
test("contact inclusion is explicit and can be cleared without changing other content", async () => {
  const h = harness([]), toggle = h.find(n => n.type === "input" && n.props.type === "checkbox"); toggle.props.onChange({ target: { checked: true } });
  await h.submit(); assert.equal(h.requests.length, 0);
  h.find(n => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: false } }); assert.equal(h.find(n => n.type === "input" && n.props.maxLength === 403).props.value, "QA names");
});
