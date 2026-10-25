import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const schema = require("../src/modules/events/schema.ts");

// Exercise the actual submit handler without a browser, network or database.
function harness(responses) {
  const states = [], refs = [], requests = [], destinations = [];
  let stateIndex = 0, refIndex = 0;
  const initial = { id: "a".repeat(24), version: 3, name: "Haldi", type: "haldi", startsAt: "2027-02-12T04:30:22Z", venue: { name: "Courtyard", address: "Test address" }, status: "draft" };
  const values = { name: "Updated Haldi", type: "haldi", startDate: "2027-02-12", startTime: "10:00", endDate: "", endTime: "", "venue.name": "Courtyard", "venue.address": "Test address" };
  class Input { constructor() { this.value = "changed"; this.defaultValue = "old"; this.validity = { badInput: false }; } }
  const form = { elements: Object.assign([new Input()], { namedItem: () => null }) };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: (value) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: value }),
    useState(value) { const index = stateIndex++; if (!(index in states)) states[index] = value; return [states[index], (next) => { states[index] = next; }]; },
    useEffect() {},
  };
  const context = { React, exports: {}, Error, AbortSignal, HTMLInputElement: Input, HTMLTextAreaElement: class {},
    crypto: { randomUUID: () => "retained-save-key-0001" }, requestAnimationFrame: () => {},
    FormData: class { get(name) { return values[name] ?? ""; } },
    require(id) { return id.includes("use-unsaved-navigation") ? {useUnsavedNavigation(){}} : id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace: (path) => destinations.push(path), refresh() {} }) } : id === "next/link" ? "a" : id.includes("schema") ? schema : { WeddingIcon: "svg" }; },
    async fetch(url, options) { requests.push({ url, ...options }); const next = responses.shift(); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; },
  };
  runInNewContext(ts.transpileModule(readFileSync("src/components/weddings/event-form.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { stateIndex = 0; refIndex = 0; return context.exports.EventForm({ weddingId: "b".repeat(24), timezone: "Asia/Kolkata", initial }).props.children[0]; }
  render();
  // The form ref is populated by React in a browser.
  refs.find((ref) => ref.current === null).current = form;
  render().props.onChange();
  return { render, requests, destinations, initial, values, form };
}

test("edit retries retain immutable key/body through lost response and 429", async () => {
  const h = harness([new Error("Lost response"), { status: 429, body: { error: { message: "Wait" } } }, { status: 200, body: { data: { id: "a".repeat(24) } } }]);
  for (let attempt = 0; attempt < 3; attempt++) {
    await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form });
    if (attempt < 2) {
      const form = h.render();
      assert.equal(form.props.children[1].props.disabled, true);
      h.values.name = "Must not replace the submitted snapshot";
    }
  }
  assert.equal(h.requests.length, 3);
  assert(h.requests.every((r) => r.method === "PATCH" && r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"]));
  const body = JSON.parse(h.requests[0].body);
  assert.equal(body.expectedVersion, 3);
  assert.equal(body.startsAt, h.initial.startsAt); // Preserve seconds when local controls were unchanged.
  assert.equal(body.endsAt, null);
  assert.deepEqual(h.destinations, [`/wedding/events/${h.initial.id}?updated=1`]);
});

test("version conflicts preserve entries and block further submissions", async () => {
  const h = harness([{ status: 409, body: { error: { code: "VERSION_CONFLICT", message: "Reload latest details" } } }]);
  await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form });
  assert.equal(h.render().props.children[1].props.disabled, true);
  await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form });
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.destinations, []);
});
