import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const schema = require("../src/modules/expenses/schema.ts"), dates = require("../src/modules/events/schema.ts");
function harness(responses, mode = "create") {
  const refs = [], states = [], requests = [], destinations = []; let r = 0, s = 0, serial = 0;
  const initial = mode === "create" ? undefined : { id: "a".repeat(24), title: "Saved", amountMinor: "155", currency: "INR", category: "venue", version: 3, expenseDate: "2027-02-12T04:30:22Z" };
  const values = { title: "Venue advance", amount: "5000.50", category: "venue", date: "2027-02-12", time: "10:00", eventId: "", notes: "" };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = v; }]; } };
  const context = { React, exports: {}, Error, AbortSignal, requestAnimationFrame() {}, crypto: { randomUUID: () => `immutable-expense-key-${++serial}` }, FormData: class { get(name) { return values[name] ?? ""; } },
    require(id) { return id.includes("use-unsaved-navigation") ? { useUnsavedNavigation() {} } : id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace: path => destinations.push(path), refresh() {} }) } : id === "next/link" ? "a" : id.includes("expenses/schema") ? schema : dates; },
    async fetch(url, options) { requests.push({ url, ...options }); const next = responses.shift(); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; },
  };
  const remove = mode === "remove", component = remove ? "RemoveExpense" : "ExpenseForm";
  runInNewContext(ts.transpileModule(readFileSync(`src/components/expenses/${remove ? "remove-expense" : "expense-form"}.tsx`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { r = 0; s = 0; return context.exports[component](remove ? { weddingId: "b".repeat(24), expense: initial } : { weddingId: "b".repeat(24), timezone: "Asia/Kolkata", currency: "INR", initial, events: [] }); }
  function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of node.props?.children?.flat(Infinity) ?? []) { const found = find(child, predicate); if (found) return found; } return null; }
  function submit() { const node = render(); return remove ? find(node, n => n.type === "button" && n.props.className === "button button-primary").props.onClick() : find(node, n => n.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} }); }
  return { render, submit, find, values, requests, destinations, initial };
}
test("lost response and 429 preserve the immutable expense body/key until confirmed", async () => {
  const h = harness([Error("lost"), { status: 429, body: {} }, { status: 201, body: { data: { id: "a".repeat(24) } } }]);
  await h.submit(); h.values.amount = "9999"; await h.submit(); await h.submit();
  assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"]));
  assert.equal(JSON.parse(h.requests[0].body).amountMinor, "500050"); assert.deepEqual(h.destinations, ["/wedding/expenses/" + "a".repeat(24)]);
});
test("invalid money and incomplete dates fail before making a save request", async () => {
  const h = harness([]); h.values.amount = "1.001"; await h.submit(); assert.equal(h.requests.length, 0);
  h.values.amount = "1"; h.values.date = ""; await h.submit(); assert.equal(h.requests.length, 0);
});
test("expense edits preserve untouched seconds and send explicit optional clears", async () => {
  const h = harness([{ status: 200, body: { data: { id: "a".repeat(24) } } }], "edit"); await h.submit();
  const input = JSON.parse(h.requests[0].body); assert.equal(input.expenseDate, h.initial.expenseDate); assert.equal(input.eventId, null); assert.equal(input.notes, null); assert.equal(input.expectedVersion, 3); assert.equal(h.requests[0].method, "PATCH");
});
test("conflict, archive and session expiry stop blind resubmission while preserving form values", async () => {
  for (const status of [401, 404, 409]) { const h = harness([{ status, body: { error: { message: "Review latest details" } } }], "edit"); await h.submit(); await h.submit(); assert.equal(h.requests.length, 1); assert.equal(h.destinations.length, 0); assert.equal(h.values.amount, "5000.50"); }
});
test("failed validation permits correction with a fresh key", async () => {
  const h = harness([{ status: 422, body: { error: { fields: [{ path: "title", message: "Check title" }] } } }, { status: 201, body: { data: { id: "a".repeat(24) } } }]); await h.submit(); h.values.title = "Corrected"; await h.submit(); assert.notEqual(h.requests[0].headers["Idempotency-Key"], h.requests[1].headers["Idempotency-Key"]);
});
test("removal retains its version/key through lost response and rate limits", async () => {
  const h = harness([Error("lost"), { status: 429, body: {} }, { status: 200, body: { data: { id: "a".repeat(24), deletedAt: "2027-01-01" } } }], "remove"); for (let i = 0; i < 3; i++) await h.submit(); assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"])); assert.equal(JSON.parse(h.requests[0].body).expectedVersion, 3);
});
