import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const schema = require("../src/modules/tasks/schema.ts"), dates = require("../src/modules/events/schema.ts");
function harness(responses, mode = "edit") {
  const refs = [], states = [], requests = [], destinations = []; let r = 0, s = 0;
  const initial = mode === "create" ? undefined : { id: "a".repeat(24), title: "Task", version: 3, status: "todo", priority: "normal", dueAt: "2027-02-12T04:30:22Z", ...(mode === "inactive" ? { assigneeUserId: "c".repeat(24) } : {}) };
  const values = { title: "Updated task", description: "", priority: "high", status: "in_progress", dueDate: "2027-02-12", dueTime: "10:00", assigneeUserId: "", eventId: "" };
  class Input { constructor() { this.value = "changed"; this.defaultValue = "old"; this.validity = { badInput: false }; } }
  class Select { constructor(value) { this.value = value; this.options = [{ selected: true, defaultSelected: false }]; } }
  const controls = { ...(mode === "inactive" ? { assigneeUserId: new Select("c".repeat(24)) } : {}) };
  const form = { elements: Object.assign([new Input()], { namedItem: (name) => controls[name] ?? null }) };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: (value) => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], (v) => { states[i] = v; }]; } };
  const context = { React, exports: {}, Error, AbortSignal, HTMLInputElement: Input, HTMLSelectElement: Select, HTMLTextAreaElement: class {}, requestAnimationFrame() {}, crypto: { randomUUID: () => "immutable-task-save-001" }, FormData: class { get(name) { return values[name] ?? ""; } },
    require(id) { return id.includes("use-unsaved-navigation") ? { useUnsavedNavigation() {} } : id === "react" ? React : id === "next/navigation" ? { useRouter: () => ({ replace: (path) => destinations.push(path), refresh() {} }) } : id === "next/link" ? "a" : id.includes("tasks/schema") ? schema : id.includes("events/schema") ? dates : { WeddingIcon: "svg" }; },
    async fetch(url, options) { requests.push({ url, ...options }); const next = responses.shift(); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; },
  };
  runInNewContext(ts.transpileModule(readFileSync("src/components/tasks/task-form.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { r = 0; s = 0; return context.exports.TaskForm({ weddingId: "b".repeat(24), timezone: "Asia/Kolkata", initial, choices: { members: [], events: [] }, statusOnly: mode === "status" }).props.children[0]; }
  render(); refs.find((ref) => ref.current === null).current = form;
  return { render, values, form, requests, destinations, initial };
}
test("task edit retries preserve the immutable key/body through lost response and 429", async () => {
  const h = harness([new Error("Lost response"), { status: 429, body: {} }, { status: 200, body: { data: { id: "a".repeat(24) } } }]); h.render().props.onChange();
  for (let i = 0; i < 3; i++) { await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form }); h.values.title = "Must not alter snapshot"; }
  assert.equal(h.requests.length, 3); assert(h.requests.every((r) => r.body === h.requests[0].body && r.headers["Idempotency-Key"] === h.requests[0].headers["Idempotency-Key"]));
  const body = JSON.parse(h.requests[0].body); assert.equal(body.dueAt, h.initial.dueAt); assert.equal(body.expectedVersion, 3); assert.equal(body.assigneeUserId, null);
  assert.deepEqual(h.destinations, [`/wedding/tasks/${h.initial.id}?updated=1`]);
});
test("task create validates incomplete deadlines before sending and uses POST on success", async () => {
  const h = harness([{ status: 201, body: { data: { id: "a".repeat(24) } } }], "create"); h.values.dueTime = "";
  await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form }); assert.equal(h.requests.length, 0);
  h.values.dueTime = "10:00"; await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form }); assert.equal(h.requests[0].method, "POST");
});
test("inactive selected assignees cannot silently disappear through FormData omission", async () => {
  const h = harness([], "inactive"); h.render().props.onChange(); await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form }); assert.equal(h.requests.length, 0);
});
test("status-only updates retain their version and block repeats after a conflict", async () => {
  const h = harness([{ status: 409, body: { error: { code: "VERSION_CONFLICT", message: "Reload latest details" } } }], "status"); h.render().props.onChange();
  await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form }); await h.render().props.onSubmit({ preventDefault() {}, currentTarget: h.form });
  assert.equal(h.requests.length, 1); assert.deepEqual(JSON.parse(h.requests[0].body), { status: "in_progress", expectedVersion: 3 }); assert.equal(h.destinations.length, 0);
});
