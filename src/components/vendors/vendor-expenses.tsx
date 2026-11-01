import Link from "next/link";
import type { User } from "@/modules/identity/service";
import { AccountError } from "@/modules/identity/security";
import { expenseSummary, type ExpenseSummary } from "@/modules/expenses/service";
import { expenseMoney } from "@/modules/expenses/schema";

export async function VendorExpenses({ user, weddingId, vendorId, canAdd }: { user: User; weddingId: string; vendorId: string; canAdd: boolean }) {
  let summary: ExpenseSummary | undefined;
  try {
    summary = await expenseSummary(user, weddingId, { vendorId });
  } catch (error) {
    if (error instanceof AccountError && [401, 403, 404].includes(error.status)) throw error;
  }
  if (!summary) return <section className="workspace-panel planning-vendor-detail-section"><h2>Recorded spending</h2><p>Vendor spending information is temporarily unavailable. Your saved expenses have not changed.</p></section>;
  return <section className="workspace-panel planning-vendor-detail-section"><h2>Recorded spending</h2><p className="vendor-recorded-spending">{expenseMoney(summary.totalSpentMinor, summary.currency)}</p><p className="planning-vendor-helper">Across {summary.expenseCount} recorded {summary.expenseCount === 1 ? "expense" : "expenses"}. Removed expense records are excluded.</p><div className="planning-vendor-form-actions"><Link className="button button-secondary" href={`/wedding/expenses?vendorId=${vendorId}`}>View recorded expenses →</Link>{canAdd && <Link className="button button-primary" href={`/wedding/expenses/new?vendorId=${vendorId}`}>+ Add expense for vendor</Link>}</div><p className="planning-vendor-helper">This is actual recorded spending, not a contract total or outstanding balance.</p></section>;
}
