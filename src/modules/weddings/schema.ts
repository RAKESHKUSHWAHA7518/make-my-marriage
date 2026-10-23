import { z } from "zod";

// Initial supported currencies all use two decimal minor units.
export const currencies = [
  "INR",
  "USD",
  "GBP",
  "EUR",
  "AUD",
  "CAD",
  "SGD",
  "AED",
] as const;
export const MAX_MONEY = 9223372036854775807n;
export const createWeddingSchema = z.strictObject({
  couple: z.strictObject({
    brideName: z
      .string()
      .trim()
      .min(1, "Please enter the bride’s name.")
      .max(200, "Use 200 characters or fewer."),
    groomName: z
      .string()
      .trim()
      .min(1, "Please enter the groom’s name.")
      .max(200, "Use 200 characters or fewer."),
  }),
  title: z
    .string()
    .trim()
    .min(1, "Please enter a workspace name.")
    .max(200, "Use 200 characters or fewer."),
  timezone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        if (!/^[A-Za-z][A-Za-z0-9_+\/-]*$/.test(value)) return false;
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid time zone."),
  currency: z.enum(currencies),
  weddingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    }, "Choose a valid date.")
    .optional(),
  budgetMinor: z
    .string()
    .regex(/^(0|[1-9]\d{0,18})$/)
    .refine(
      (value) => /^\d+$/.test(value) && BigInt(value) <= MAX_MONEY,
      "Budget is too large.",
    )
    .optional(),
});
export type CreateWedding = z.infer<typeof createWeddingSchema>;

export function budgetToMinor(value: string) {
  if (!value.trim()) return undefined;
  const clean = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(clean))
    throw new Error(
      "Enter a nonnegative amount with up to two decimal places, without commas.",
    );
  const [whole, fraction = ""] = clean.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result > MAX_MONEY) throw new Error("Budget is too large.");
  return result.toString();
}

export function displayBudget(minor: string, currency: string) {
  const amount = BigInt(minor);
  const whole = (amount / 100n).toLocaleString(
    currency === "INR" ? "en-IN" : "en-US",
  );
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `${currency} ${whole}${fraction === "00" ? "" : `.${fraction}`}`;
}
