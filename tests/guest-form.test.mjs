import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), schema = require("../src/modules/households/schema.ts"), dates = require("../src/modules/events/schema.ts");

function harness(responses, mode = "edit") {
  const refs = [], states = [], requests = [], destinations = []; let r = 0, s = 0;
  const event = { id: "c".repeat(24), name: "Haldi", status: "draft", available: true, startsAt: "2027-02-13T04:30:00Z" };
  const initial = mode === "create" ? undefined : { id: "a".repeat(24), displayName: "Guest", representative: { name: "Guest", email: "old@example.test" }, maxGuests: 4, invitedEventIds: [event.id], events: [event], notes: "Old notes", side: "bride", tags: ["Family"], rsvp: { status: "pending" }, version: 2 };
  const values = { name: "Updated guest", email: "", phone: "", notes: "" };
  class Input { name = "name"; }
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = typeof v === "function" ? v(states[i]) : v; }]; } };
  const context = { React, exports: {}, Error, AbortSignal, HTMLInputElement: Input, HTMLTextAreaElement: class {}, requestAnimationFrame() {}, crypto: { randomUUID: () => "immutable-guest-save-001" }, FormData: class { get(name) { return values[name] ?? ""; } },
    require(id) { return id.includes("use-unsaved-navigation") ? { useUnsavedNavigation() {} } : id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace: path => destinations.push(path), refresh() {} }) } : id === "next/link" ? "a" : id.includes("households/schema") ? schema : id.includes("events/schema") ? dates : { WeddingIcon: "svg" }; },
    async fetch(url, options) { requests.push({ url, ...options }); const next = responses.shift(); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; },
  };
  runInNewContext(ts.transpileModule(readFileSync("src/components/guests/guest-form.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { r = 0; s = 0; return context.exports.GuestForm({ weddingId: "b".repeat(24), timezone: "Asia/Kolkata", initial, choices: mode === "unavailable" ? [] : [event] }).props.children[0]; }
  return { render, values, requests, destinations, change() { render().props.onChange({ target: new Input() }); } };
}
test("guest edit retains immutable payload/key through a lost response and rate-limited retry", async () => {
  const h = harness([new Error("lost"), { status: 429, body: {} }, { status: 200, body: { data: { id: "a".repeat(24) } } }]); h.change();
  for (let i = 0; i < 3; i++) { await h.render().props.onSubmit({ preventDefault() {}, currentTarget: {} }); h.values.name = "Must not replace snapshot"; }
  assert.equal(h.requests.length, 3); assert(h.requests.every(r => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"]));
  const value = JSON.parse(h.requests[0].body); assert.equal(value.representative.email, undefined); assert.equal(value.notes, null); assert.equal(value.expectedVersion, 2); assert.equal(value.side, "bride"); assert.equal(h.destinations[0], `/wedding/guests/${"a".repeat(24)}?updated=1`);
});
test("guest form blocks conflicting saves while retaining the edited entries", async () => {
  const h = harness([{ status: 409, body: { error: { code: "VERSION_CONFLICT", message: "Reload" } } }]); h.change();
  await h.render().props.onSubmit({ preventDefault() {}, currentTarget: {} }); await h.render().props.onSubmit({ preventDefault() {}, currentTarget: {} }); assert.equal(h.requests.length, 1); assert.equal(h.values.name, "Updated guest"); assert.equal(h.destinations.length, 0);
});
test("unavailable event associations cannot silently disappear or be saved", async () => {
  const h = harness([], "unavailable"); h.change(); await h.render().props.onSubmit({ preventDefault() {}, currentTarget: {} }); assert.equal(h.requests.length, 0);
});
test("new groups require an explicit event selection before any request", async () => {
  const h = harness([], "create"); await h.render().props.onSubmit({ preventDefault() {}, currentTarget: {} }); assert.equal(h.requests.length, 0);
});
