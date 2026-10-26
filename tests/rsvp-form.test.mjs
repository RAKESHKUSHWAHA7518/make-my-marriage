import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), schema = require("../src/modules/guest-access/schema.ts");
function harness(responses) {
  const states = [], refs = [], requests = [], destinations = []; let s = 0, r = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = v; }]; } };
  const context = { React, exports: {}, Error, AbortSignal, requestAnimationFrame() {}, crypto: { randomUUID: () => "retained-rsvp-save-001" },
    require(id) { return id === "react" ? React : id === "next/link" ? "a" : id === "next/navigation" ? { useRouter: () => ({ replace: path => destinations.push(path), refresh() {} }) } : id.includes("schema") ? schema : { useUnsavedNavigation() {} }; },
    async fetch(url, options) { requests.push({ url, ...options }); const next = responses.shift(); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; },
  };
  runInNewContext(ts.transpileModule(readFileSync("src/components/invitation/rsvp-form.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { s = 0; r = 0; return context.exports.RsvpForm({ site: { rsvp: { status: "pending", attendeeCount: 0, maxGuests: 4, version: 1, invitationRevision: "a".repeat(64), editable: true } } }).props.children[0]; }
  function choose(index) { render().props.children[1].props.children[1][index].props.children[0].props.onChange(); }
  function count(value) { render().props.children[2].props.children[2].props.children[1].props.onChange({ currentTarget: { value } }); }
  async function submit() { await render().props.onSubmit({ preventDefault() {} }); }
  return { render, choose, count, submit, requests, destinations };
}
test("RSVP requires a selection and a whole count within the household limit", async () => {
  const h = harness([]); await h.submit(); assert.equal(h.requests.length, 0);
  h.choose(0); for (const value of ["", "0", "5", "1.5"]) { h.count(value); await h.submit(); assert.equal(h.requests.length, 0); }
});
test("uncertain RSVP retains immutable key and body across HTTP 429", async () => {
  const h = harness([new Error("Lost response"), { status: 429, body: {} }, { status: 200, body: { data: { rsvp: { status: "attending", version: 2 } } } }]);
  h.choose(0); h.count("3");
  for (let i = 0; i < 3; i++) { await h.submit(); if (i < 2) assert.equal(h.render().props.children[1].props.disabled, true); }
  assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"]));
  assert.equal(JSON.parse(h.requests[0].body).attendeeCount, 3); assert.deepEqual(h.destinations, ["/guest/response"]);
});
test("not attending clears the count and stale invitation conflicts block saves", async () => {
  const h = harness([{ status: 409, body: { error: { code: "VERSION_CONFLICT", message: "Reload latest" } } }]);
  h.choose(0); h.count("3"); h.choose(1); await h.submit();
  assert.equal(JSON.parse(h.requests[0].body).attendeeCount, 0); assert.equal(h.render().props.children[1].props.disabled, true);
  await h.submit(); assert.equal(h.requests.length, 1); assert.deepEqual(h.destinations, []);
});
