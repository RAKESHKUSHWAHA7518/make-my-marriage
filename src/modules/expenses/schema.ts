import { z } from "zod";
import { currencies, MAX_MONEY, budgetToMinor } from "@/modules/weddings/schema";

export const expenseCategories = ["venue", "food", "decoration", "clothing", "other"] as const;
export const expenseCategoryLabels = { venue: "Venue", food: "Food", decoration: "Decoration", clothing: "Clothing", other: "Other" };
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const instant = z.iso.datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v)), "Enter a valid date and time.");
const fields = z.strictObject({
  title: z.string().trim().min(1, "Enter an expense title.").max(200),
  amountMinor: z.string().regex(/^[1-9]\d{0,18}$/, "Enter a positive amount.").refine(v => /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= MAX_MONEY, "Amount is too large."),
  currency: z.enum(currencies), expenseDate: instant, category: z.enum(expenseCategories),
  eventId: objectId.optional(), notes: z.string().trim().max(10000).optional(),
  // Receipts are deliberately empty until the family-only receipt workflow exists.
  receiptAssetIds: z.array(objectId).max(0).default([]),
});
export const createExpenseSchema = fields;
export const patchExpenseSchema = fields.omit({ receiptAssetIds: true }).partial().extend({
  receiptAssetIds: z.array(objectId).max(0).optional(),
  eventId: objectId.nullable().optional(), notes: z.string().trim().max(10000).nullable().optional(), expectedVersion: z.number().int().positive(),
}).refine(v => Object.keys(v).some(k => k !== "expectedVersion"), "Supply at least one change.");
export const removeExpenseSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
const queryFields = z.strictObject({
  category: z.enum(expenseCategories).optional(), eventId: z.union([objectId, z.literal("none")]).optional(),
  from: instant.optional(), to: instant.optional(), limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.string().max(2500).optional(),
});
const validRange = (v: { from?: string; to?: string }) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to);
export const expenseQuerySchema = queryFields.refine(validRange, "Choose a valid date range.");
export const expenseSummaryQuerySchema = queryFields.omit({ limit: true, cursor: true }).refine(validRange, "Choose a valid date range.");
export function expenseAmount(value: string) {
  const result = budgetToMinor(value);
  if (!result || BigInt(result) <= 0n) throw Error("Enter a positive amount with up to two decimal places, without commas.");
  return result;
}
export function expenseMoney(value: string, currency: string) {
  const negative = BigInt(value) < 0n, amount = negative ? -BigInt(value) : BigInt(value), fraction = (amount % 100n).toString().padStart(2, "0");
  const parts = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(amount / 100n);
  return `${negative ? "−" : ""}${parts.filter(p => fraction !== "00" || !["decimal", "fraction"].includes(p.type)).map(p => p.type === "fraction" ? fraction : p.value).join("")}`;
}
export function expenseInputAmount(minor: string) {
  return `${BigInt(minor) / 100n}.${(BigInt(minor) % 100n).toString().padStart(2, "0")}`;
}
