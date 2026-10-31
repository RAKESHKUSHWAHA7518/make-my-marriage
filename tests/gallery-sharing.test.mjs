import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const initial = { isEnabled: true, guestUploadsEnabled: false, version: 2, tokenVersion: 1, weddingState: "active" };
function harness(results, role = "ADMIN", settings = initial) {
  const states = [], refs = [], requests = []; let s = 0, r = 0, serial = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useMemo: fn => fn(), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; }, useRef(value) { return refs[r++] ?? (refs[r - 1] = { current: value }); } };
  const context = { React, exports: {}, Error, AbortSignal, encodeURIComponent, crypto: { randomUUID: () => `immutable-key-${++serial}` }, require(id) { if (id === "react") return React; if (id === "next/link" || id === "next/image") return id; if (id === "qrcode-generator") return require(id); throw Error(id); }, async fetch(url, options) { requests.push({ url, ...options }); const next = results.shift(); assert(next); if (next instanceof Error) throw next; return { ok: next.status < 300, status: next.status, json: async () => next.body }; } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/gallery/gallery-sharing.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function walk(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(walk); return [node, ...walk(node.props?.children)]; }
  function render() { s = r = 0; return walk(context.exports.GallerySharing({ initial: settings, weddingId: "a".repeat(24), role })); }
  function button(text) { const found = render().find(n => n.type === "button" && n.props.children.includes(text)); assert(found, text); return found; }
  return { requests, render, button, async click(text) { await button(text).props.onClick(); } };
}
test("uncertain rotation and 429 retry preserve the identical immutable save", async () => {
  const url = `http://localhost:3001/gallery#token=${"a".repeat(43)}`;
  const h = harness([new Error("Lost response"), { status: 429, body: { error: { message: "Wait" } } }, { status: 200, body: { data: { settings: { ...initial, version: 3, tokenVersion: 2 }, url } } }]);
  await h.click("Replace gallery link"); await h.click("Confirm"); await h.click("Retry same save"); await h.click("Retry same save");
  assert.equal(h.requests.length, 3); for (const request of h.requests) { assert.equal(request.body, h.requests[0].body); assert.equal(request.headers["Idempotency-Key"], h.requests[0].headers["Idempotency-Key"]); }
  const qr = h.render().find(n => n.props?.alt === "QR code for this private gallery link"); assert.match(qr.props.src, /^data:image\/svg\+xml/); assert.match(decodeURIComponent(qr.props.src), /<svg/);
  const input = h.render().find(n => n.type === "input"); assert.equal(input.props.value, url);
});
test("MANAGER has no rotation controls and archived MANAGER has no enable/disable action", () => {
  const active = harness([], "MANAGER").render(); assert.equal(active.some(n => n.type === "button" && n.props.children.includes("Replace gallery link")), false);
  const archived = harness([], "MANAGER", { ...initial, weddingState: "archived" }).render(); assert.equal(archived.some(n => n.type === "button" && ["Enable guest viewing", "Disable guest viewing"].some(label => n.props.children.includes(label))), false);
});
test("successful settings save followed by failed link read does not replay the mutation", async () => {
  const h = harness([{ status: 200, body: { data: { settings: { ...initial, version: 2 } } } }, new Error("Link read unavailable")], "ADMIN", { ...initial, isEnabled: false, version: 1 });
  await h.click("Enable guest viewing"); await h.click("Confirm");
  assert.equal(h.requests.filter(r => r.method === "PATCH").length, 1);
  assert.equal(h.button("Disable guest viewing").props.disabled, false);
  assert(h.render().some(n => n.props?.role === "alert" && n.props.children.some(c => typeof c === "string" && c.includes("Sharing was saved"))));
});
test("guest upload switch confirms and saves only the upload permission", async () => {
  const next = { ...initial, guestUploadsEnabled: true, version: 3 };
  const h = harness([{ status: 200, body: { data: { settings: next } } }, { status: 200, body: { data: { url: `http://localhost:3001/gallery#token=${"a".repeat(43)}` } } }]);
  const toggle = h.render().find(node => node.props?.role === "switch"); assert(toggle); assert.equal(toggle.props["aria-checked"], false);
  toggle.props.onClick(); await h.click("Confirm");
  const payload = JSON.parse(h.requests[0].body); assert.equal(payload.guestUploadsEnabled, true); assert.equal(payload.isEnabled, undefined); assert.equal(payload.expectedVersion, initial.version);
  assert.equal(h.render().find(node => node.props?.role === "switch").props["aria-checked"], true);
});
