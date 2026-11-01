import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), schemas = require("../src/modules/announcements/schema.ts");
function harness(responses, initial) {
  const refs = [], states = [], requests = [], destinations = []; let ri = 0, si = 0, serial = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef(v) { const i = ri++; return refs[i] ?? (refs[i] = { current: v }); }, useState(v) { const i = si++; if (!(i in states)) states[i] = v; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; } };
  const context = { React, exports: {}, Error, JSON, AbortSignal, requestAnimationFrame() {}, crypto: { randomUUID: () => `announcement-key-${++serial}` }, require: id => id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace(url) { destinations.push(url); }, refresh() {} }) } : id.includes("announcements/schema") ? schemas : id.includes("use-unsaved") ? { useUnsavedNavigation() {} } : "component", async fetch(url, options) { requests.push({ url, ...options }); const r = responses.shift(); if (r instanceof Error) throw r; return { ok: r.status < 300, status: r.status, json: async () => r.body }; } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/announcements/announcement-form.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { ri = 0; si = 0; return context.exports.AnnouncementForm({ weddingId: "a".repeat(24), initial }); }
  function walk(n) { if (!n || typeof n !== "object") return []; if (Array.isArray(n)) return n.flatMap(walk); return [n, ...walk(n.props?.children)]; }
  const find = f => walk(render()).find(f);
  return { requests, destinations, find, title: value => find(n => n.type === "input" && n.props.name === "title").props.onChange({ target: { value } }), body: value => find(n => n.type === "textarea").props.onChange({ target: { value } }), submit: () => find(n => n.type === "form").props.onSubmit({ preventDefault() {} }) };
}
test("required title/message validation preserves values and sends no request", async () => {
  const h = harness([]); h.title("  "); h.body("Remember the planning call"); await h.submit(); assert.equal(h.requests.length, 0); assert(h.find(n => n.type === "input" && n.props.name === "title").props["aria-invalid"]); assert.equal(h.find(n => n.type === "textarea").props.value, "Remember the planning call");
});
test("unknown response and rate limit retain immutable announcement input/key until confirmed", async () => {
  const h = harness([Error("lost"), { status: 429, body: {} }, { status: 200, body: { data: { id: "b".repeat(24) } } }]); h.title("Planning call"); h.body("Private message"); await h.submit(); assert(h.find(n => n.type === "fieldset").props.disabled); h.title("Attempted change after response loss"); await h.submit(); await h.submit();
  assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"])); assert.equal(h.destinations[0], `/wedding/announcements/${"b".repeat(24)}`);
});
test("conflict/access errors stop blind saves and preserve local text", async () => {
  for (const status of [401, 403, 404, 409]) { const h = harness([{ status, body: { error: { message: "Review latest" } } }]); h.title("My local title"); h.body("My local text"); await h.submit(); await h.submit(); assert.equal(h.requests.length, 1); assert(h.find(n => n.type === "fieldset").props.disabled); assert.equal(h.find(n => n.type === "textarea").props.value, "My local text"); }
});
test("definitive validation failure permits correction with a fresh key; edits bind original version", async () => {
  const h = harness([{ status: 422, body: { error: { message: "Check fields" } } }, { status: 200, body: { data: { id: "b".repeat(24) } } }], { id: "b".repeat(24), title: "Old", body: "Original", pinned: true, version: 7, author: { name: "Original author" } }); h.title("First attempt"); await h.submit(); h.body("Corrected message"); await h.submit();
  assert.notEqual(h.requests[0].headers["Idempotency-Key"], h.requests[1].headers["Idempotency-Key"]); const saved = JSON.parse(h.requests[1].body); assert.equal(saved.expectedVersion, 7); assert.equal(saved.pinned, true); assert.equal(saved.body, "Corrected message"); assert(!("createdBy" in saved));
});
