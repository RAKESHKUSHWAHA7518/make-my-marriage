import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url), schema = require("../src/modules/designs/schema.ts"), layout = require("../src/modules/designs/image-layout.ts");
const content = { name: "Our card", mode: "template", eventIds: [], draft: { templateKey: "elegant", textFields: { heading: "Join us", coupleNames: "Test & Only", message: "Together", closing: "With love" }, assetIds: [], layout: { palette: "ivory", font: "playfair" } } };
test("image line wrapping retains all wording, explicit paragraphs and long Unicode names", () => {
  const text = `One two\n\n${"नमस्ते😀".repeat(400)} final`;
  const lines = layout.wrapCardText(text, t => [...t].length * 10, 100);
  assert(lines.includes("")); assert.equal(lines.join("").replace(/\s/g, ""), text.replace(/\s/g, "")); assert(lines.every(l => [...l].length <= 10));
});
function harness(input, options = {}) {
  const states = [], refs = [], draws = [], downloads = []; let s = 0, r = 0, calls = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: value => refs[r++] ?? (refs[r - 1] = { current: value }), useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = v; }]; } };
  const ctx = { font: "", measureText(t) { return { width: [...t].length * Number.parseInt(this.font) * .6 }; }, fillText(text, x, y) { draws.push({ text, x, y }); }, fillRect() {}, strokeRect() {}, drawImage() {} }, canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: callback => callback(new Blob(["png"], { type: "image/png" })) };
  const context = { React, exports: {}, Error, Blob, AbortSignal, Promise, setTimeout: fn => fn(), URL: { createObjectURL: () => "blob:isolated", revokeObjectURL() {} }, getComputedStyle: () => ({ getPropertyValue: () => "Georgia" }), document: { documentElement: {}, fonts: { load: async () => [] }, body: { append() {} }, createElement: name => name === "canvas" ? canvas : { click() { downloads.push(this.download); }, remove() {} } }, async fetch() { calls++; return { ok: !options.fail, blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }) }; }, createImageBitmap: async () => ({ width: 100, height: 150, close() {} }), require: id => id === "react" ? React : id.includes("image-layout") ? layout : schema };
  runInNewContext(ts.transpileModule(readFileSync("src/components/designs/download-card.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  function render() { s = 0; r = 0; return context.exports.DownloadCard({ content: input, available: true }); }
  return { canvas, draws, downloads, calls: () => calls, render, click: async () => render().props.children[0].props.onClick() };
}
test("template PNG export grows for long content without clipping or a provider call", async () => {
  const long = structuredClone(content); long.draft.textFields.message = "Celebrate together. ".repeat(400); const h = harness(long); await h.click(); assert.equal(h.downloads[0], "Our card.png"); assert(h.canvas.height > 1400); assert(h.draws.every(d => d.y < h.canvas.height)); assert.equal(h.calls(), 0);
});
test("uploaded artwork uses protected media and supports a failed download retry", async () => {
  const h = harness({ name: "Image", mode: "uploaded_image", eventIds: [], draft: { assetIds: ["a".repeat(24)] } }, { fail: true }); await h.click(); assert.equal(h.downloads.length, 0); assert.equal(h.render().props.children[0].props.children[0], "Retry download");
  const ok = harness({ name: "Image", mode: "uploaded_image", eventIds: [], draft: { assetIds: ["a".repeat(24)] } }); await ok.click(); assert.equal(ok.downloads[0], "Image.png"); assert.equal(ok.canvas.height, 150);
});
