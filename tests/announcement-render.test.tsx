import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnnouncementCard, AnnouncementDashboard } from "../src/components/announcements/announcement-display";
const item = { id: "a".repeat(24), title: "<script>Private update</script>", body: "Line one\nLine two <b>plain text</b>", pinned: true, author: { name: "Original author" }, version: 2, createdAt: "2026-11-01T04:00:00Z", updatedAt: "2026-11-01T05:00:00Z" };
test("read-only card escapes plain text, preserves author/timestamps and hides mutations", () => {
  const html = renderToStaticMarkup(<AnnouncementCard item={item} weddingId={"b".repeat(24)} timezone="Asia/Kolkata" readOnly />); assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;b&gt;plain text/); assert.match(html, /Original author/); assert.match(html, /Edited/); assert.match(html, /Pinned/); assert.doesNotMatch(html, /<script|<button|>Edit<|>Remove<|>Unpin</);
});
test("dashboard items link directly to full posts and show only projected excerpts", () => {
  const summary = { id: item.id, title: item.title, pinned: item.pinned, author: item.author, version: item.version, createdAt: item.createdAt, updatedAt: item.updatedAt, excerpt: "Short excerpt" };
  const html = renderToStaticMarkup(<AnnouncementDashboard items={[summary]} timezone="Asia/Kolkata" archived />); assert.match(html, /Short excerpt/); assert.match(html, new RegExp(`/wedding/announcements/${item.id}`)); assert.doesNotMatch(html, /Line one|New announcement|replies|Acknowledged|WhatsApp|SMS/);
});
