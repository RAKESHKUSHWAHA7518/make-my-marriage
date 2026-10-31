import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), selection = require("../src/components/gallery/file-selection.ts");
function harness(results, enabled = true, audience = "guest") {
  const states = [], refs = [], requests = [], uploads = [], revoked = [], effects = []; let s = 0, r = 0, serial = 0, initialized = false, saves = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; }, useRef(value) { return refs[r++] ?? (refs[r - 1] = { current: value }); }, useEffect(fn) { if (!initialized) effects.push(fn); } };
  class Xhr { status = 200; upload = {}; open(method, url) { this.url = url; } send() { uploads.push(this.url); this.onload(); } }
  const context = { React, exports: {}, Error, AbortSignal, URL: { createObjectURL: () => `blob:test-${++serial}`, revokeObjectURL: url => revoked.push(url) }, crypto: { randomUUID: () => `immutable-key-${++serial}` }, FormData: class { append() {} }, XMLHttpRequest: Xhr,
    require(id) { if (id === "react") return React; if (id === "next/image") return "img"; if (id === "next/navigation") return { useRouter: () => ({ push() {} }) }; if (id.includes("file-selection")) return selection; if (id === "./upload-transport") { const transportContext = { ...context, exports: {} }; runInNewContext(ts.transpileModule(readFileSync("src/components/gallery/upload-transport.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, transportContext); return transportContext.exports; } return { useUnsavedNavigation() {} }; },
    async fetch(url, options) { requests.push({ url, ...options }); const next = results.shift(); assert(next); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; },
  };
  runInNewContext(ts.transpileModule(readFileSync("src/components/gallery/guest-upload-panel.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function walk(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(walk); return [node, ...walk(node.props?.children)]; }
  function render() { s = r = 0; const nodes = walk(context.exports.GuestUploadPanel({ audience, enabled, onSaved: async () => { saves++; } })); if (!initialized) { initialized = true; effects.forEach(fn => fn()); } return nodes; }
  function select(files = [{ name: "photo.jpg", type: "image/jpeg", size: 100 }]) { render().find(n => n.type === "input" && n.props.type === "file").props.onChange({ target: { files, value: "" } }); }
  async function click(label) { const button = render().find(n => n.type === "button" && n.props.children.includes(label)); assert(button, label); await button.props.onClick(); }
  return { select, render, click, states, requests, uploads, revoked, saves: () => saves };
}
const intent = { status: 201, body: { data: { id: "b".repeat(24), upload: { url: "https://provider.test/upload", fields: { signature: "synthetic" } } } } };
const ready = { status: 200, body: { data: { ready: true } } };
test("guest completion loss and 429 check the retained intent without another transfer", async () => {
  const h = harness([intent, new Error("Lost response"), { status: 429, body: { error: { message: "Wait" } } }, ready]); h.select(); await h.click("Upload / check photos"); await h.click("Check upload status"); await h.click("Check upload status");
  assert.equal(h.uploads.length, 1); assert(h.requests.every(r => r.url.endsWith("?audience=guest"))); assert.equal(h.requests.filter(r => r.url.includes("/complete")).length, 3); assert.equal(h.states[0][0].status, "Uploaded");
});
test("lost guest intent creation retains immutable key/payload across a rate limit", async () => {
  const h = harness([new Error("Lost create"), { status: 429, body: { error: { message: "Wait" } } }, intent, ready], true, "household"); h.select(); await h.click("Upload / check photos"); await h.click("Retry upload"); await h.click("Retry upload");
  const creates = h.requests.filter(r => !r.url.includes("/complete")); assert.equal(creates.length, 3); for (const request of creates) { assert.equal(request.body, creates[0].body); assert.equal(request.headers["Idempotency-Key"], creates[0].headers["Idempotency-Key"]); assert(request.url.endsWith("?audience=household")); }
});
test("invalid/over-limit selection preserves the existing valid queue without truncation", () => {
  const h = harness([]); h.select(); h.select([{ name: "bad.heic", type: "image/heic", size: 1 }]); assert.equal(h.states[0].length, 1);
  h.select(Array(20).fill({ name: "photo.jpg", type: "image/jpeg", size: 100 })); assert.equal(h.states[0].length, 1); assert(h.states[2]);
});
test("permission rejection stops the remaining batch and cannot show uploaded success", async () => {
  const h = harness([{ status: 403, body: { error: { message: "Uploads turned off" } } }]); h.select(Array(2).fill({ name: "photo.jpg", type: "image/jpeg", size: 100 })); await h.click("Upload / check photos"); assert.equal(h.requests.length, 1); assert.equal(h.uploads.length, 0); assert.equal(h.states[0][0].blocked, true); assert.equal(h.states[0][1].status, "Waiting");
});
test("clearing completed files revokes local previews without deleting saved photos", async () => {
  const h = harness([intent, ready]); h.select(); await h.click("Upload / check photos"); await h.click("Clear uploaded photos"); assert.equal(h.states[0].length, 0); assert.equal(h.revoked.length, 1); assert(h.requests.every(r => !r.url.includes("remove")));
});
