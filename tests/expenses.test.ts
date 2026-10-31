import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateExpenses } from "../src/infrastructure/mongodb/migrations/011-expenses";
import { createWedding, updateWedding, weddingFor } from "../src/modules/weddings/service";
import { createEvent } from "../src/modules/events/service";
import { expenseChoices, expenseFor, expenseSummary, expensesReady, listExpenses, saveExpense } from "../src/modules/expenses/service";
import { createExpenseSchema, expenseAmount, expenseInputAmount, expenseMoney, patchExpenseSchema } from "../src/modules/expenses/schema";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";
import { handleExpenses } from "../src/modules/expenses/http";

test("money validation and display are exact without floats", () => {
  assert.equal(expenseAmount("5000.50"), "500050"); assert.equal(expenseInputAmount("9223372036854775807"), "92233720368547758.07");
  assert.equal(expenseMoney("-101", "INR"), "−₹1.01");
  for (const amount of ["0", "-1", "1.001", "1,000", "NaN", "1e5", "92233720368547758.08"]) assert.throws(() => expenseAmount(amount));
  for (const extra of [{ vendorId: new ObjectId().toString() }, { receiptAssetIds: [new ObjectId().toString()] }, { paid: true }, { amountMinor: "1.5" }, { amountMinor: "0" }, { amountMinor: 100 }]) assert.equal(createExpenseSchema.safeParse({ title: "Test", amountMinor: "100", currency: "INR", expenseDate: "2027-01-01T00:00:00Z", category: "other", ...extra }).success, false);
  assert.equal(patchExpenseSchema.safeParse({ expectedVersion: 1 }).success, false);
});

test("expense management uses only a disposable loopback replica database", async t => {
  // No .env loader: never fall back to the application's production configuration.
  assert.match(process.env.MONGODB_URI ?? "", /^mongodb:\/\/127\.0\.0\.1:27192\//);
  const name = `mmm_expenses_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name; process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex"); process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "expensesqa");
  const key = () => randomBytes(16).toString("hex");
  const input = { title: "Actual expense", amountMinor: "10050", currency: "INR", expenseDate: "2027-02-10T12:00:00+05:30", category: "venue" };
  async function fixture(budgetMinor?: string) {
    const now = new Date(), email = `${key()}@example.test`;
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Expense QA", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated expense wedding", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR", ...(budgetMinor ? { budgetMinor } : {}) }, key());
    return { user, wedding };
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db);
    await t.test("readiness fails closed without implicitly creating expenses", async () => {
      const f = await fixture(); await assert.rejects(expenseSummary(f.user, f.wedding.id), { code: "EXPENSES_UNAVAILABLE" }); assert.equal(await db.listCollections({ name: "expenses" }).hasNext(), false);
    });
    await migrateExpenses(db); await migrateExpenses(db);
    await t.test("strict schema and four indexes support ADMIN/MANAGER with private DTOs", async () => {
      const f = await fixture(); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role: "MANAGER" } });
      const e = await saveExpense(f.user, f.wedding.id, null, input, key()); assert.equal(e.amountMinor, "10050");
      const row = await db.collection("expenses").findOne({ _id: new ObjectId(e.id) }); assert.equal(await db.collection("expenses").countDocuments({ _id: row!._id, amountMinor: { $type: "long" } }), 1); assert.deepEqual(row!.receiptAssetIds, []);
      assert.equal(Object.keys(e).some(k => ["createdBy", "operationKey", "requestHash", "weddingId", "providerId"].includes(k)), false);
      await assert.rejects(db.collection("expenses").updateOne({ _id: row!._id }, { $set: { amountMinor: 1.5 } }));
      assert.equal((await db.collection("expenses").indexes()).filter(i => i.name?.startsWith("expenses_")).length, 4);
      await expensesReady();
    });
    await t.test("concurrent creations and expired retry receipts cannot duplicate expenses", async () => {
      const f = await fixture(), k = key(); const saves = await Promise.all([1, 2, 3].map(() => saveExpense(f.user, f.wedding.id, null, input, k)));
      assert.equal(new Set(saves.map(e => e.id)).size, 1);
      await assert.rejects(saveExpense(f.user, f.wedding.id, null, { ...input, title: "Changed" }, k), { code: "IDEMPOTENCY_CONFLICT" });
      await db.collection("idempotencyKeys").deleteMany({ resourceId: new ObjectId(saves[0].id) });
      assert.equal((await saveExpense(f.user, f.wedding.id, null, input, k)).id, saves[0].id);
      assert.equal(await db.collection("expenses").countDocuments({ weddingId: new ObjectId(f.wedding.id) }), 1);
      assert.equal(await db.collection("activity").countDocuments({ entityId: new ObjectId(saves[0].id), action: "expense.created" }), 1);
    });
    await t.test("optimistic edit/removal races, null clearing and replay preserve history", async () => {
      const f = await fixture(), event = await createEvent(f.user, f.wedding.id, { name: "Haldi", type: "haldi", startsAt: "2027-01-01T00:00:00Z", venue: { name: "Test", address: "Test" } }, key());
      const e = await saveExpense(f.user, f.wedding.id, null, { ...input, notes: "Test", eventId: event.id }, key()), k = key();
      const patch = { expectedVersion: 1, notes: null, eventId: null, amountMinor: "55" };
      const edits = await Promise.all([1, 2].map(() => saveExpense(f.user, f.wedding.id, e.id, patch, k))); assert(edits.every(v => v.version === 2 && !v.notes && !v.eventId));
      const race = await Promise.allSettled(["A", "B"].map(title => saveExpense(f.user, f.wedding.id, e.id, { expectedVersion: 2, title }, key()))); assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
      await assert.rejects(saveExpense(f.user, f.wedding.id, e.id, { expectedVersion: 2 }, key(), true), { code: "VERSION_CONFLICT" });
      const removeKey = key(); await saveExpense(f.user, f.wedding.id, e.id, { expectedVersion: 3 }, removeKey, true);
      assert((await saveExpense(f.user, f.wedding.id, e.id, { expectedVersion: 3 }, removeKey, true)).deletedAt);
      assert.equal((await expenseSummary(f.user, f.wedding.id)).totalSpentMinor, "0"); assert.equal((await listExpenses(f.user, f.wedding.id)).data.length, 0);
      assert((await expenseFor(f.user, f.wedding.id, e.id))!.deletedAt);
      assert.equal(await db.collection("activity").countDocuments({ entityId: new ObjectId(e.id), action: "expense.removed" }), 1);
      assert.equal((await weddingFor(f.user))!.currencyLocked, true);
      await assert.rejects(updateWedding(f.user, f.wedding.id, { expectedVersion: 1, currency: "USD" }), { code: "CURRENCY_LOCKED" });
    });
    await t.test("totals, budget overrun, filters and pagination count actual spending once", async () => {
      const f = await fixture("10000"); await saveExpense(f.user, f.wedding.id, null, input, key()); await saveExpense(f.user, f.wedding.id, null, { ...input, category: "food", amountMinor: "50" }, key());
      const summary = await expenseSummary(f.user, f.wedding.id); assert.equal(summary.totalSpentMinor, "10100"); assert.equal(summary.budgetRemainingMinor, "-100"); assert.equal(summary.expenseCount, 2);
      const filtered = await expenseSummary(f.user, f.wedding.id, { category: "food" }); assert.equal(filtered.totalSpentMinor, "50"); assert.equal(filtered.budgetRemainingMinor, null); assert.equal(filtered.budgetMinor, null);
      const first = await listExpenses(f.user, f.wedding.id, { limit: 1 }), second = await listExpenses(f.user, f.wedding.id, { limit: 1, cursor: first.pagination.nextCursor }); assert.notEqual(first.data[0].id, second.data[0].id); assert.equal(first.pagination.total, 2);
      await assert.rejects(listExpenses(f.user, f.wedding.id, { cursor: first.pagination.nextCursor, category: "food" }), { code: "INVALID_CURSOR" });
      assert.equal((await listExpenses(f.user, f.wedding.id, { eventId: "none" })).data.length, 2);
      assert.equal((await listExpenses(f.user, f.wedding.id, { to: "2027-02-09T00:00:00Z" })).data.length, 0);
      const empty = await fixture(); assert.equal((await expenseSummary(empty.user, empty.wedding.id)).budgetMinor, null);
      const large = await fixture(); for (let i = 0; i < 2; i++) await saveExpense(large.user, large.wedding.id, null, { ...input, amountMinor: "9223372036854775807" }, key());
      assert.equal((await expenseSummary(large.user, large.wedding.id)).totalSpentMinor, "18446744073709551614");
    });
    await t.test("tenant/event isolation, archive, verification, timezone and credential checks", async () => {
      const f = await fixture(), b = await fixture();
      const foreignEvent = await createEvent(b.user, b.wedding.id, { name: "Other", type: "custom", startsAt: "2027-01-01T00:00:00Z", venue: { name: "Test", address: "Test" } }, key());
      await assert.rejects(saveExpense(f.user, f.wedding.id, null, { ...input, eventId: foreignEvent.id }, key()), { code: "EVENT_UNAVAILABLE" });
      assert.equal((await expenseChoices(f.user, f.wedding.id)).length, 0);
      await assert.rejects(saveExpense(f.user, f.wedding.id, null, { ...input, currency: "USD" }, key()), { code: "CURRENCY_CHANGED" });
      await assert.rejects(saveExpense(f.user, f.wedding.id, null, input, key(), false, "UTC"), { code: "WEDDING_TIMEZONE_CHANGED" });
      const k = key(), e = await saveExpense(f.user, f.wedding.id, null, input, k);
      assert.equal(await expenseFor(b.user, b.wedding.id, e.id), null); await assert.rejects(expenseFor(b.user, f.wedding.id, e.id), { status: 404 });
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } });
      assert.equal((await saveExpense(f.user, f.wedding.id, null, input, k)).id, e.id);
      for (const mode of ["create", "edit", "remove"]) await assert.rejects(saveExpense(f.user, f.wedding.id, mode === "create" ? null : e.id, mode === "create" ? input : { expectedVersion: 1, ...(mode === "edit" ? { title: "Changed" } : {}) }, key(), mode === "remove"), { code: "WEDDING_ARCHIVED" });
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "removed" } }); await assert.rejects(saveExpense(f.user, f.wedding.id, null, input, k), { status: 404 });
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "active" } });
      await db.collection("users").updateOne({ _id: f.user._id }, { $inc: { credentialVersion: 1 } }); await assert.rejects(expenseSummary(f.user, f.wedding.id), { status: 403 });
      await db.collection("users").updateOne({ _id: b.user._id }, { $unset: { emailVerifiedAt: "" } }); await assert.rejects(saveExpense(b.user, b.wedding.id, null, input, key()), { status: 403 });
    });
    await t.test("currency edits and first expense share the transaction fence", async () => {
      const f = await fixture();
      const results = await Promise.allSettled([saveExpense(f.user, f.wedding.id, null, input, key()), updateWedding(f.user, f.wedding.id, { expectedVersion: 1, currency: "USD" })]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      const wedding = await weddingFor(f.user), rows = await db.collection("expenses").find({ weddingId: new ObjectId(f.wedding.id) }).toArray();
      assert(rows.every(r => r.currency === wedding!.currency));
    });
    await t.test("HTTP requires organizer session, trusted origin and CSRF with private responses", async () => {
      const f = await fixture(), token = randomBytes(32).toString("base64url"), now = new Date();
      await db.collection("sessions").insertOne({ userId: f.user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3001/api/v1/weddings/${f.wedding.id}/expenses`, headers = { Origin: "http://localhost:3001", "Content-Type": "application/json", "X-MMM-CSRF": "1", Cookie: `mmm_session=${token}`, "Idempotency-Key": key() };
      assert.equal((await handleExpenses(new NextRequest(url), "list", f.wedding.id)).status, 401);
      assert.equal((await handleExpenses(new NextRequest(url, { headers: { Cookie: "mmm_gallery=anything" } }), "list", f.wedding.id)).status, 401);
      for (const bad of [{ Origin: "https://other.example" }, { "X-MMM-CSRF": "" }]) assert.equal((await handleExpenses(new NextRequest(url, { method: "POST", headers: { ...headers, ...bad }, body: JSON.stringify(input) }), "create", f.wedding.id)).status, 403);
      const response = await handleExpenses(new NextRequest(url, { method: "POST", headers, body: JSON.stringify(input) }), "create", f.wedding.id); assert.equal(response.status, 201); assert.match(response.headers.get("cache-control")!, /private, no-store/);
      const e = (await response.json()).data; assert.equal(e.amountMinor, "10050");
      const summary = await handleExpenses(new NextRequest(url + "/summary", { headers }), "summary", f.wedding.id); assert.equal((await summary.json()).data.expenseCount, 1);
    });
  } finally {
    if (db.databaseName === name && /^mmm_expenses_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase();
    await closeDatabase();
  }
});
