import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebsitePreviewContent } from "../src/components/website/website-preview";
import { WeddingCelebration } from "../src/components/website/public-website";
const preview = { coupleNames: "Test & Only", intro: "", events: [], timezone: "Asia/Kolkata", draftVersion: 1, selectionChanged: false };
test("empty preview omits optional sections, invented dates and private controls", () => {
  const html = renderToStaticMarkup(<WebsitePreviewContent preview={preview} />);
  assert.match(html, /Test &amp; Only/); assert.match(html, /Private family preview/);
  assert.doesNotMatch(html, /<img|countdown|RSVP|gallery|<input|Wedding inquiries|itinerary|With love/);
});
test("public rendering uses only supplied sections and never includes organizer controls or preview labels", () => {
  const html = renderToStaticMarkup(<WeddingCelebration content={{ coupleNames: "Public <names>", intro: "", events: [], timezone: "Asia/Kolkata" }} />);
  assert.match(html, /Public &lt;names&gt;/); assert.doesNotMatch(html, /Private family|<input|RSVP|gallery|Destination|countdown|inquiries|itinerary/);
});
test("plain text is escaped and event output excludes unselected private properties", () => {
  const html = renderToStaticMarkup(<WebsitePreviewContent preview={{ ...preview, intro: '<script>alert("x")</script>', date: "2027-02-10", events: [{ id: "a".repeat(24), name: "Ceremony", startsAt: "2027-02-10T12:00:00Z", venue: { name: "Selected venue", address: "Approved address" }, description: "Selected description" }] }} />);
  assert.doesNotMatch(html, /<script|dangerouslySetInnerHTML/); assert.match(html, /&lt;script&gt;/); assert.match(html, /Selected venue/); assert.match(html, /Asia\/Kolkata/);
});
