import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
function harness(responses) {
  const refs = [], states = [], requests = []; let ri = 0, si = 0, serial = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef(v) { const i = ri++; return refs[i] ?? (refs[i] = { current: v }); }, useState(v) { const i = si++; if (!(i in states)) states[i] = v; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; } };
  const context = { React, exports: {}, JSON, Error, AbortSignal, crypto: { randomUUID: () => `announcement-action-${++serial}` }, require: id => id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace() {}, refresh() {} }) } : "component", async fetch(url, options) { requests.push({ url, ...options }); const r = responses.shift(); if (r instanceof Error) throw r; return { ok: r.status < 300, status: r.status, json: async () => r.body }; } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/announcements/announcement-actions.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { ri = 0; si = 0; return context.exports.AnnouncementActions({ weddingId: "a".repeat(24), item: { id: "b".repeat(24), pinned: false, version: 3 } }); }
  function walk(n) { if (!n || typeof n !== "object") return []; if (Array.isArray(n)) return n.flatMap(walk); return [n, ...walk(n.props?.children)]; }
  const find = label => walk(render()).find(n => n.type === "button" && n.props.children.flat(Infinity).includes(label));
  return { requests, find, click: async label => { const button = find(label); assert(button, `Missing ${label}`); if (!button.props.disabled) await button.props.onClick(); } };
}
test("pin and confirmed removal retain original version/key/body through loss and 429", async () => {
  for (const label of ["Pin", "Remove announcement"]) {
    const h = harness([Error("lost"), { status: 429, body: {} }, { status: 200, body: { data: { id: "b".repeat(24) } } }]); await h.click(label); await h.click("Retry same request"); await h.click("Retry same request"); assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"])); const input = JSON.parse(h.requests[0].body); assert.equal(input.expectedVersion, 3); assert.equal(input.pinned, label === "Pin" ? true : undefined);
  }
});
test("conflicting or revoked actions stop mutation controls and offer current-status reload", async () => {
  for (const status of [401, 403, 404, 409]) { const h = harness([{ status, body: { error: { message: "Access or version changed" } } }]); await h.click("Pin"); assert(!h.find("Pin")); assert(h.find("Reload current status")); assert.equal(h.requests.length, 1); }
});
