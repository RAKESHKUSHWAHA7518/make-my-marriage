import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), schema = require("../src/modules/tasks/schema.ts");
function harness(responses, props = {}) {
  const states = [], refs = [], requests = []; let s = 0, r = 0;
  const task = { id: "a".repeat(24), version: 3, checklist: [{ id: "step", text: "Confirm setup", done: false }] };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = v; }]; } };
  const context = { React, exports: {}, Error, AbortSignal, requestAnimationFrame() {}, crypto: { randomUUID: () => "same-checklist-key" }, require(id) { return id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace() {}, refresh() {} }) } : id === "next/link" ? "a" : id.includes("tasks/schema") ? schema : id.includes("checklist-rows") ? { ChecklistRows: "rows" } : { useUnsavedNavigation() {} }; }, async fetch(url, options) { requests.push({ url, ...options }); const response = responses.shift(); if (response instanceof Error) throw response; return { ok: response.status < 300, status: response.status, json: async () => response.body }; } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/tasks/task-checklist.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { s = 0; r = 0; return context.exports.TaskChecklist({ task, weddingId: "b".repeat(24), enabled: true, readOnly: false, ...props }); }
  return { render, requests, task };
}
function nodes(node, predicate) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(n => nodes(n, predicate)); return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]; }
const checkbox = tree => nodes(tree, n => n.type === "input" && n.props.type === "checkbox")[0];
const retry = tree => nodes(tree, n => n.type === "button" && n.props.children.includes("Retry same save"))[0];
test("inline checklist retains confirmed state and immutable request through lost response and 429", async () => {
  const h = harness([new Error("lost"), { status: 429, body: {} }, { status: 200, body: { data: { id: "a".repeat(24), version: 4, checklist: [{ id: "step", text: "Confirm setup", done: true }] } } }]);
  checkbox(h.render()).props.onChange({ target: { checked: true } }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(checkbox(h.render()).props.checked, false); assert(checkbox(h.render()).props.disabled);
  await retry(h.render()).props.onClick(); await retry(h.render()).props.onClick();
  assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === "same-checklist-key"));
  assert.equal(JSON.parse(h.requests[0].body).expectedVersion, 3); assert.equal(checkbox(h.render()).props.checked, true);
});
test("focused editor preserves values after validation and blocks stale saves", async () => {
  const h = harness([{ status: 409, body: { error: { message: "Reload latest" } } }], { edit: true });
  const rows = () => nodes(h.render(), n => n.type === "rows")[0], form = () => nodes(h.render(), n => n.type === "form")[0];
  rows().props.onChange([{ id: "step", text: " ", done: true }]); form().props.onSubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 0); assert.equal(rows().props.items[0].text, " "); assert(rows().props.fields["checklist.0.text"]);
  rows().props.onChange([{ id: "step", text: "Changed wording", done: true }]); form().props.onSubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(rows().props.items[0].text, "Changed wording"); assert(rows().props.disabled);
  form().props.onSubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve)); assert.equal(h.requests.length, 1);
});
test("invalid successful responses stay uncertain and archived/unactivated checklists cannot save", async () => {
  const h = harness([{ status: 200, body: { data: { id: "a".repeat(24), version: 3, checklist: [] } } }]); checkbox(h.render()).props.onChange({ target: { checked: true } }); await new Promise(resolve => setImmediate(resolve)); assert(retry(h.render())); assert.equal(checkbox(h.render()).props.checked, false);
  for (const props of [{ readOnly: true }, { enabled: false }]) { const read = harness([], props); assert.equal(checkbox(read.render()), undefined); assert.equal(read.requests.length, 0); }
});
