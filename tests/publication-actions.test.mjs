import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
function nodes(n, p) { if (!n || typeof n !== "object") return []; if (Array.isArray(n)) return n.flatMap(v => nodes(v, p)); return [...(p(n) ? [n] : []), ...nodes(n.props?.children, p)]; }
function harness(responses, props = {}) {
  const states = [], refs = [], requests = [], destinations = []; let s = 0, r = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = v; }]; } };
  const context = { React, exports: {}, AbortSignal, Error, crypto: { randomUUID: () => "immutable-publish-key" }, window: { location: { reload() {} } }, require: id => id === "react" ? React : { useRouter: () => ({ replace: p => destinations.push(p), refresh() {} }) }, async fetch(url, options) { requests.push({ url, ...options }); const response = responses.shift(); if (response instanceof Error) throw response; return { ok: response.status < 300, status: response.status, json: async () => response.body }; } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/designs/publication-actions.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { s = 0; r = 0; return context.exports.PublicationAction({ url: "/publish", payload: { expectedVersion: 1 }, destination: "/versions/{version}", label: "Publish version", ...props }); }
  return { render, requests, destinations, click: async () => nodes(render(), n => n.type === "button")[0].props.onClick() };
}
test("publication lost responses, malformed successes and 429 retain immutable body/key", async () => {
  const h = harness([new Error("lost"), { status: 429, body: {} }, { status: 201, body: { data: { designVersionId: "invalid" } } }, { status: 201, body: { data: { designVersionId: "a".repeat(24) } } }]);
  for (let i = 0; i < 4; i++) await h.click();
  assert.equal(h.requests.length, 4); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === "immutable-publish-key")); assert.equal(h.destinations[0], `/versions/${"a".repeat(24)}`);
});
test("review consent and archive gates prevent writes; conflicts require reload", async () => {
  for (const props of [{ disabled: true }, { confirmation: "Confirm wording" }]) { const h = harness([], props); await h.click(); assert.equal(h.requests.length, 0); }
  const h = harness([{ status: 409, body: { error: { message: "Review again" } } }]); await h.click(); await h.click(); assert.equal(h.requests.length, 1); assert(nodes(h.render(), n => n.type === "button" && n.props.children.includes("Reload and review")).length);
});
test("household selection validates success and never treats unknown outcomes as rollback", async () => {
  const h = harness([{ status: 200, body: {} }, { status: 200, body: { data: { saved: true } } }], { destination: "/household" }); await h.click(); assert.equal(h.destinations.length, 0); await h.click(); assert.equal(h.destinations[0], "/household"); assert.equal(h.requests[0].body, h.requests[1].body);
});
