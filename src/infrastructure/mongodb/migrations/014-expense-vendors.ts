import type { Db } from "mongodb";

/** Index-only extension: migration 011 already permits optional vendorId. */
export async function migrateExpenseVendors(db: Db) {
  if (!await db.listCollections({ name: "expenses" }).hasNext()) throw Error("Migration 011 is required first.");
  await db.collection("expenses").createIndex({ weddingId: 1, vendorId: 1, deletedAt: 1, expenseDate: -1, _id: -1 }, { name: "expenses_vendor" });
}
