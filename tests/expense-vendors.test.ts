import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateExpenses } from "../src/infrastructure/mongodb/migrations/011-expenses";
import { migrateVendors } from "../src/infrastructure/mongodb/migrations/012-vendors";
import { migrateGoogleVendors } from "../src/infrastructure/mongodb/migrations/013-google-vendors";
import { migrateExpenseVendors } from "../src/infrastructure/mongodb/migrations/014-expense-vendors";
import { createWedding } from "../src/modules/weddings/service";
import { saveVendor } from "../src/modules/vendors/service";
import { expenseFor, expenseSummary, expenseVendorChoices, expenseVendorLinksEnabled, listExpenses, saveExpense } from "../src/modules/expenses/service";
import type { User } from "../src/modules/identity/service";

test("vendor expense associations use only a disposable loopback replica", async t => {
  assert.match(process.env.MONGODB_URI ?? "", /^mongodb:\/\/127\.0\.0\.1:27192\//);
  const name = `mmm_expense_vendors_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = name;
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.equal((await db.admin().command({ hello: 1 })).setName, "expensesqa");
  const key = () => randomBytes(16).toString("hex");
  const input = { title: "Actual expense", amountMinor: "500050", currency: "INR", expenseDate: "2027-02-10T12:00:00+05:30", category: "food" };
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`;
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Isolated vendor QA", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated wedding", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR", budgetMinor: "1000000" }, key());
    const vendor = await saveVendor(user, wedding.id, null, { name: "Private caterer", category: "catering", source: "MANUAL", eventIds: [] }, key());
    return { user, wedding, vendor };
  }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db); await migrateExpenses(db); await migrateVendors(db); await migrateGoogleVendors(db);
    await t.test("pending activation leaves unlinked expenses working and fails linking closed", async () => {
      const f = await fixture(); assert.equal(await expenseVendorLinksEnabled(), false);
      await saveExpense(f.user, f.wedding.id, null, input, key());
      await assert.rejects(saveExpense(f.user, f.wedding.id, null, { ...input, vendorId: f.vendor.id }, key()), { code: "EXPENSE_VENDOR_LINKS_UNAVAILABLE" });
      await assert.rejects(expenseSummary(f.user, f.wedding.id, { vendorId: f.vendor.id }), { code: "EXPENSE_VENDOR_LINKS_UNAVAILABLE" });
      assert.equal((await expenseSummary(f.user, f.wedding.id)).expenseCount, 1);
    });
    await t.test("014 is repeatable, index-only, and preserves validators and records", async () => {
      const before = await db.listCollections({ name: "expenses" }, { nameOnly: false }).next(), rows = await db.collection("expenses").find().toArray();
      await migrateExpenseVendors(db); await migrateExpenseVendors(db);
      assert.deepEqual((await db.listCollections({ name: "expenses" }, { nameOnly: false }).next())?.options, before?.options);
      assert.deepEqual(await db.collection("expenses").find().toArray(), rows);
      assert.equal(await expenseVendorLinksEnabled(), true);
      const index = (await db.collection("expenses").indexes()).find(i => i.name === "expenses_vendor")!;
      assert.deepEqual(index.key, { weddingId: 1, vendorId: 1, deletedAt: 1, expenseDate: -1, _id: -1 }); assert(!index.unique);
    });
    await t.test("ADMIN and MANAGER link manual/Google references without provider configuration or side effects", async () => {
      for (const role of ["ADMIN", "MANAGER"]) {
        const f = await fixture(); await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role } });
        const google = await saveVendor(f.user, f.wedding.id, null, { source: "GOOGLE_PLACES", googlePlaceId: "ChIJ_isolated_reference", name: "Private Google label", category: "venue", eventIds: [] }, key());
        const before = await db.collection("vendors").find({ weddingId: new ObjectId(f.wedding.id) }).toArray();
        for (const vendor of [f.vendor, google]) {
          const e = await saveExpense(f.user, f.wedding.id, null, { ...input, vendorId: vendor.id }, key());
          assert.equal(e.vendorId, vendor.id); assert.equal(e.vendor?.name, vendor.name); assert.equal(e.vendor?.source, vendor.source); assert.equal(e.amountMinor, input.amountMinor); assert.equal(e.category, "food"); assert(!e.eventId);
          assert(!JSON.stringify(e).includes("googlePlaceId"));
        }
        assert.deepEqual(await db.collection("vendors").find({ weddingId: new ObjectId(f.wedding.id) }).toArray(), before);
        const choices = await expenseVendorChoices(f.user, f.wedding.id); assert.equal(choices.length, 2); assert(choices.every(v => !Object.keys(v).some(k => ["contact", "notes", "googlePlaceId", "requestHash"].includes(k))));
      }
    });
    await t.test("foreign, missing and removed choices are denied without exposing another wedding", async () => {
      const a = await fixture(), b = await fixture(); await saveVendor(b.user, b.wedding.id, b.vendor.id, { expectedVersion: 1 }, key(), true);
      for (const vendorId of [b.vendor.id, new ObjectId().toString()]) await assert.rejects(saveExpense(a.user, a.wedding.id, null, { ...input, vendorId }, key()), { code: "VENDOR_UNAVAILABLE" });
      await assert.rejects(saveExpense(b.user, b.wedding.id, null, { ...input, vendorId: b.vendor.id }, key()), { code: "VENDOR_UNAVAILABLE" });
      assert.equal((await expenseVendorChoices(b.user, b.wedding.id)).length, 0); assert.equal((await expenseVendorChoices(b.user, b.wedding.id, true))[0].status, "removed");
      assert.deepEqual((await expenseVendorChoices(a.user, a.wedding.id)).map(v => v.id), [a.vendor.id]);
      await assert.rejects(expenseVendorChoices(b.user, a.wedding.id), { status: 404 });
    });
    await t.test("removal retains history and spending; unchanged association, clear and replacement preserve money", async () => {
      const f = await fixture(), e = await saveExpense(f.user, f.wedding.id, null, { ...input, vendorId: f.vendor.id, notes: "Private" }, key());
      await saveVendor(f.user, f.wedding.id, f.vendor.id, { expectedVersion: 1 }, key(), true);
      const retained = await expenseFor(f.user, f.wedding.id, e.id); assert.equal(retained?.vendor?.status, "removed"); assert.equal(retained?.vendor?.name, f.vendor.name);
      const updated = await saveExpense(f.user, f.wedding.id, e.id, { expectedVersion: 1, vendorId: f.vendor.id, title: "Still editable" }, key()); assert.equal(updated.amountMinor, input.amountMinor);
      const unlinked = await saveExpense(f.user, f.wedding.id, e.id, { expectedVersion: 2, vendorId: null }, key()); assert(!unlinked.vendorId); assert(!unlinked.vendor); assert.equal(unlinked.notes, "Private"); assert.equal(unlinked.category, input.category); assert.equal(unlinked.expenseDate, e.expenseDate);
      const next = await saveVendor(f.user, f.wedding.id, null, { source: "MANUAL", name: "Replacement", category: "other", eventIds: [] }, key());
      const replaced = await saveExpense(f.user, f.wedding.id, e.id, { expectedVersion: 3, vendorId: next.id }, key()); assert.equal(replaced.vendorId, next.id); assert.equal(replaced.amountMinor, input.amountMinor);
      assert.equal((await expenseSummary(f.user, f.wedding.id)).totalSpentMinor, input.amountMinor);
    });
    await t.test("vendor and unlinked filters scope cursors, sums and budget comparisons", async () => {
      const f = await fixture();
      for (let i = 0; i < 2; i++) await saveExpense(f.user, f.wedding.id, null, { ...input, vendorId: f.vendor.id }, key());
      await saveExpense(f.user, f.wedding.id, null, { ...input, amountMinor: "100" }, key());
      const filtered = await expenseSummary(f.user, f.wedding.id, { vendorId: f.vendor.id }); assert.equal(filtered.totalSpentMinor, "1000100"); assert.equal(filtered.expenseCount, 2); assert.equal(filtered.budgetMinor, null); assert.equal(filtered.budgetRemainingMinor, null);
      assert.equal((await expenseSummary(f.user, f.wedding.id)).totalSpentMinor, "1000200");
      assert.equal((await expenseSummary(f.user, f.wedding.id, { vendorId: "none" })).totalSpentMinor, "100");
      const page = await listExpenses(f.user, f.wedding.id, { vendorId: f.vendor.id, limit: 1 }); assert(page.pagination.nextCursor);
      assert.equal((await listExpenses(f.user, f.wedding.id, { vendorId: f.vendor.id, cursor: page.pagination.nextCursor })).data.length, 1);
      await assert.rejects(listExpenses(f.user, f.wedding.id, { vendorId: "none", cursor: page.pagination.nextCursor }), { code: "INVALID_CURSOR" });
      await saveExpense(f.user, f.wedding.id, page.data[0].id, { expectedVersion: 1 }, key(), true);
      assert.equal((await expenseSummary(f.user, f.wedding.id, { vendorId: f.vendor.id })).totalSpentMinor, input.amountMinor);
    });
    await t.test("lost-save replay survives vendor removal/receipt expiry and cannot duplicate; revocation still wins", async () => {
      const f = await fixture(), k = key(), body = { ...input, vendorId: f.vendor.id };
      const saved = await saveExpense(f.user, f.wedding.id, null, body, k);
      await saveVendor(f.user, f.wedding.id, f.vendor.id, { expectedVersion: 1 }, key(), true);
      await db.collection("idempotencyKeys").deleteMany({ resourceId: new ObjectId(saved.id) });
      assert.equal((await saveExpense(f.user, f.wedding.id, null, body, k)).id, saved.id);
      await assert.rejects(saveExpense(f.user, f.wedding.id, null, { ...body, vendorId: undefined }, k), { code: "IDEMPOTENCY_CONFLICT" });
      assert.equal(await db.collection("expenses").countDocuments({ weddingId: new ObjectId(f.wedding.id) }), 1);
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { status: "removed" } });
      await assert.rejects(saveExpense(f.user, f.wedding.id, null, body, k), { status: 404 });
    });
    await t.test("expense creation and vendor removal serialize under the wedding fence", async () => {
      const f = await fixture();
      const [created, removed] = await Promise.allSettled([saveExpense(f.user, f.wedding.id, null, { ...input, vendorId: f.vendor.id }, key()), saveVendor(f.user, f.wedding.id, f.vendor.id, { expectedVersion: 1 }, key(), true)]);
      assert.equal(removed.status, "fulfilled");
      if (created.status === "fulfilled") { assert.equal((await expenseFor(f.user, f.wedding.id, created.value.id))?.vendor?.status, "removed"); assert.equal((await expenseSummary(f.user, f.wedding.id)).totalSpentMinor, input.amountMinor); }
      else { assert.equal(created.reason.code, "VENDOR_UNAVAILABLE"); assert.equal((await expenseSummary(f.user, f.wedding.id)).expenseCount, 0); }
    });
    await t.test("historical missing/foreign references never expose foreign fields; archive/conflicts deny changes", async () => {
      const a = await fixture(), b = await fixture(), e = await saveExpense(a.user, a.wedding.id, null, input, key());
      // Simulate legacy dangling data in this disposable database only.
      await db.collection("expenses").updateOne({ _id: new ObjectId(e.id) }, { $set: { vendorId: new ObjectId(b.vendor.id) } });
      const historical = await expenseFor(a.user, a.wedding.id, e.id); assert.equal(historical?.vendor?.name, "Unavailable vendor"); assert.equal(historical?.vendor?.status, "unavailable"); assert(!historical?.vendor?.category);
      await assert.rejects(saveExpense(a.user, a.wedding.id, e.id, { expectedVersion: 2, vendorId: a.vendor.id }, key()), { code: "VERSION_CONFLICT" });
      await db.collection("weddings").updateOne({ _id: new ObjectId(a.wedding.id) }, { $set: { state: "archived" } });
      await assert.rejects(saveExpense(a.user, a.wedding.id, e.id, { expectedVersion: 1, vendorId: null }, key()), { code: "WEDDING_ARCHIVED" });
      assert.equal((await expenseSummary(a.user, a.wedding.id)).totalSpentMinor, input.amountMinor);
    });
  } finally {
    if (db.databaseName === name && /^mmm_expense_vendors_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase();
    await closeDatabase();
  }
});
