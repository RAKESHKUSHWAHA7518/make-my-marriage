import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");

test("all eight route fallbacks show readable loading status without fabricated private data", () => {
  for (const route of ["wedding", "wedding/expenses", "wedding/tasks", "wedding/guests", "wedding/events", "wedding/gallery", "wedding/events/[eventId]/edit", "guest"]) {
    const Screen = require(`../src/app/${route}/loading.tsx`).default;
    const html = renderToStaticMarkup(React.createElement(Screen));
    assert.match(html, /role="status"/); assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(html, /Retry loading|Sign out|ADMIN|MANAGER|INR|₹/);
    if (route === "guest") { assert.doesNotMatch(html, /<main|Your wedding workspace|Back to workspace|page-loading-brand/); assert.match(html, /Back to homepage/); }
    else { assert.match(html, /<main/); assert.match(html, /Make My Marriage/); assert.match(html, /Back to workspace/); }
  }
});

function harness(guest = false) {
  let scheduled, cleanup, state = false, reloads = 0, cleared = false;
  const mockReact = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: () => [state, value => { state = value; }], useEffect: effect => { if (!scheduled) cleanup = effect(); } };
  const context = { React: mockReact, exports: {}, require: id => id === "react" ? mockReact : { Brand: "brand" }, window: { setTimeout(callback, delay) { assert.equal(delay, 12000); scheduled = callback; return 1; }, clearTimeout(id) { assert.equal(id, 1); cleared = true; }, location: { reload() { reloads++; } } } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/page-loading.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function walk(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(walk); return [node, ...walk(node.props?.children)]; }
  return { render: () => walk(context.exports.PageLoading({ title: "Loading", description: "Opening saved information…", guest })), delay: () => scheduled(), cleanup: () => cleanup(), reloads: () => reloads, cleared: () => cleared };
}
test("long waits offer manual recovery and never trigger automatic reloads", () => {
  for (const guest of [false, true]) {
    const h = harness(guest); const initial = h.render(); assert.equal(initial.some(n => n.type === "button"), false);
    assert(initial.some(n => n.type === "a" && n.props.href === (guest ? "/" : "/wedding")));
    h.delay(); const delayed = h.render(); assert.equal(h.reloads(), 0);
    delayed.find(n => n.type === "button").props.onClick(); assert.equal(h.reloads(), 1);
    h.cleanup(); assert.equal(h.cleared(), true);
  }
});
test("unmount cancels the delayed recovery timer before a quick page finishes loading", () => {
  const h = harness(); h.render(); h.cleanup(); assert.equal(h.cleared(), true); assert.equal(h.reloads(), 0);
});
