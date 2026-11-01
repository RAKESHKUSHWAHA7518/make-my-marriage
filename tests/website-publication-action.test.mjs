import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
function harness(responses, action = "publish", disabled = false) {
  const refs = [], states = [], requests = [], navigations = []; let ri = 0, si = 0, serial = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef(v) { const i = ri++; return refs[i] ?? (refs[i] = { current: v }); }, useState(v) { const i = si++; if (!(i in states)) states[i] = v; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; } };
  const context = { React, exports: {}, Error, JSON, Number, AbortSignal, crypto: { randomUUID: () => `publication-key-${++serial}` }, require: id => id === "react" ? React : { useRouter: () => ({ push(url) { navigations.push(url); }, refresh() {} }) }, async fetch(url, options) { requests.push({ url, ...options }); const r = responses.shift(); if (r instanceof Error) throw r; return { ok: r.status < 300, status: r.status, json: async () => r.body }; } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/website/publication-action.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { ri = 0; si = 0; return context.exports.PublicationAction({ weddingId: "a".repeat(24), action, payload: { expectedDraftVersion: 2, expectedPublishedRevision: action === "publish" ? 0 : 1, expectedReviewHash: "b".repeat(64) }, disabled }); }
  function walk(n) { if (!n || typeof n !== "object") return []; if (Array.isArray(n)) return n.flatMap(walk); return [n, ...walk(n.props?.children)]; }
  const find = f => walk(render()).find(f);
  return { requests, navigations, find, confirm: () => find(n => n.type === "input").props.onChange({ target: { checked: true } }), submit: () => find(n => n.type === "button").props.onClick() };
}
test("publication requires explicit consent and respects readiness/archive guards", async () => {
  const h = harness([]); await h.submit(); assert.equal(h.requests.length, 0);
  const blocked = harness([], "publish", true); blocked.confirm(); await blocked.submit(); assert.equal(blocked.requests.length, 0);
});
test("publish and unpublish preserve immutable key/body through lost responses and 429", async () => {
  for (const action of ["publish", "unpublish"]) {
    const h = harness([Error("lost"), { status: 429, body: {} }, { status: 200, body: { data: { publishedRevision: 2 } } }], action); h.confirm(); await h.submit(); assert(h.find(n => n.type === "input").props.disabled); await h.submit(); await h.submit();
    assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"])); assert.equal(h.navigations[0], "/wedding/website/manage");
  }
});
test("stale review and revoked session stop blind retries until current status is reloaded", async () => {
  for (const status of [401, 403, 404, 409, 422]) { const h = harness([{ status, body: { error: { message: "Review current status" } } }]); h.confirm(); await h.submit(); await h.submit(); assert.equal(h.requests.length, 1); assert(h.find(n => n.type === "input").props.disabled); }
});
test("malformed success remains uncertain and never navigates as if publication succeeded", async () => {
  const h = harness([{ status: 200, body: { data: { publishedRevision: 0 } } }]); h.confirm(); await h.submit(); assert.equal(h.navigations.length, 0); assert(h.find(n => n.type === "input").props.disabled);
});
