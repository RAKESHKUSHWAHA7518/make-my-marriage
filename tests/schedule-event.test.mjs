import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const schema = require("../src/modules/events/schema.ts");

function harness(responses) {
  const refs = [], states = [], requests = [], destinations = [];
  let refIndex = 0, stateIndex = 0, refreshes = 0, closes = 0, opens = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: (value) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: value }),
    useState(value) { const i = stateIndex++; if (!(i in states)) states[i] = value; return [states[i], (next) => { states[i] = next; }]; },
  };
  const context = { React, exports: {}, Error, AbortSignal, crypto: { randomUUID: () => "same-scheduling-key-001" },
    require: (id) => id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace: (path) => destinations.push(path), refresh: () => refreshes++ }) } : schema,
    async fetch(url, options) { requests.push({ url, ...options }); let next = responses.shift(); if (typeof next === "function") next = await next(); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; },
  };
  runInNewContext(ts.transpileModule(readFileSync("src/components/weddings/schedule-event.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() {
    stateIndex = 0; refIndex = 0;
    return context.exports.ScheduleEvent({ weddingId: "b".repeat(24), eventId: "a".repeat(24), version: 4, name: "Haldi", startsAt: "2027-02-12T04:30:00Z", venue: "Courtyard", timezone: "Asia/Kolkata" });
  }
  function find(label, node = render()) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button" && node.props.children.includes(label)) return node;
    for (const child of node.props?.children ?? []) { const result = find(label, child); if (result) return result; }
    return null;
  }
  render(); refs[0].current = { close: () => closes++, showModal: () => opens++ };
  return { render, find, requests, destinations, counts: () => ({ opens, closes, refreshes }) };
}

test("scheduling requires confirmation and retains its key through lost response and 429", async () => {
  const h = harness([new Error("Lost response"), { status: 429, body: {} }, { status: 200, body: { data: { id: "a".repeat(24), status: "scheduled" } } }]);
  h.find("Mark as scheduled").props.onClick();
  assert.equal(h.requests.length, 0);
  await h.find("Confirm scheduling").props.onClick();
  await h.find("Retry scheduling").props.onClick();
  await h.find("Retry scheduling").props.onClick();
  assert.equal(h.requests.length, 3);
  assert(h.requests.every((r) => r.method === "PATCH" && r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"]));
  assert.deepEqual(JSON.parse(h.requests[0].body), { expectedVersion: 4, status: "scheduled" });
  assert.deepEqual(h.destinations, [`/wedding/events/${"a".repeat(24)}?scheduled=1`]);
});

test("scheduling conflict blocks repeated mutation and offers a read-only reload", async () => {
  const h = harness([{ status: 409, body: { error: { code: "VERSION_CONFLICT", message: "Reload latest details" } } }]);
  await h.find("Confirm scheduling").props.onClick();
  assert.equal(h.find("Confirm scheduling"), null);
  h.find("Reload event details").props.onClick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.counts().refreshes, 1);
  assert.deepEqual(h.destinations, []);
});

test("scheduling prevents duplicate submissions while a request is in flight", async () => {
  let finish;
  const h = harness([() => new Promise((resolve) => { finish = resolve; })]);
  const submit = h.find("Confirm scheduling").props.onClick;
  const pending = submit();
  await submit();
  assert.equal(h.requests.length, 1);
  assert.equal(h.find("Scheduling…").props.disabled, true);
  finish({ status: 200, body: { data: { id: "a".repeat(24), status: "scheduled" } } });
  await pending;
});
