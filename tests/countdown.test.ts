import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntilWedding } from "../src/modules/weddings/countdown";

test("counts calendar days using the wedding timezone", () => {
  const now = new Date("2026-10-23T20:00:00Z");
  assert.equal(daysUntilWedding("2026-10-25", "Asia/Kolkata", now), 1);
  assert.equal(daysUntilWedding("2026-10-25", "America/Los_Angeles", now), 2);
  assert.equal(daysUntilWedding("2026-10-24", "Asia/Kolkata", now), 0);
  assert.equal(daysUntilWedding("2026-10-23", "Asia/Kolkata", now), -1);
});
test("handles DST changes and leap days without rounding partial days", () => {
  assert.equal(
    daysUntilWedding(
      "2026-03-09",
      "America/New_York",
      new Date("2026-03-08T05:01:00Z"),
    ),
    1,
  );
  assert.equal(
    daysUntilWedding(
      "2026-11-02",
      "America/New_York",
      new Date("2026-11-01T04:01:00Z"),
    ),
    1,
  );
  assert.equal(
    daysUntilWedding("2028-03-01", "UTC", new Date("2028-02-28T23:59:00Z")),
    2,
  );
});
test("does not invent a countdown for missing or invalid saved dates", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  assert.equal(daysUntilWedding(undefined, "UTC", now), null);
  assert.equal(daysUntilWedding("2027-02-30", "UTC", now), null);
  assert.equal(daysUntilWedding("2027-02-14", "Invalid/Zone", now), null);
});
