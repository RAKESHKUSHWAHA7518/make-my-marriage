import Link from "next/link";
import type { ExpenseSummary, ExpenseView } from "@/modules/expenses/service";
import { expenseCategoryLabels, expenseMoney } from "@/modules/expenses/schema";
import { eventDate } from "@/modules/events/schema";
export function ExpenseMetrics({ summary, canEditBudget = false }: { summary: ExpenseSummary; canEditBudget?: boolean }) {
  const over = summary.budgetRemainingMinor !== null && BigInt(summary.budgetRemainingMinor) < 0n;
  return <section className={`expense-metrics ${summary.filtered ? "expense-metrics-filtered" : ""}`} aria-label="Spending summary">
    <article><small>{summary.filtered ? "Filtered spending" : "Total recorded spending"}</small><strong>{expenseMoney(summary.totalSpentMinor, summary.currency)}</strong><p>Actual recorded expenses</p></article>
    {!summary.filtered && <><article><small>Overall wedding budget</small><strong>{summary.budgetMinor === null ? "Budget not set" : expenseMoney(summary.budgetMinor, summary.currency)}</strong>{canEditBudget && <Link href="/wedding/details">Wedding details →</Link>}</article><article className={over ? "expense-over-budget" : "expense-remaining"}><small>{over ? "Over budget by" : "Budget remaining"}</small><strong>{summary.budgetRemainingMinor === null ? "Budget not set" : expenseMoney((over ? -BigInt(summary.budgetRemainingMinor) : BigInt(summary.budgetRemainingMinor)).toString(), summary.currency)}</strong><p>{summary.budgetMinor === null ? "Set an optional budget in wedding details." : "Budget minus recorded spending"}</p></article></>}
    <article><small>{summary.filtered ? "Matching expenses" : "Recorded expenses"}</small><strong>{summary.expenseCount.toLocaleString("en-IN")}</strong><p>{summary.filtered ? "Budget comparison hidden while filters are active." : "Saved entries"}</p></article>
  </section>;
}
export function ExpenseRows({ expenses, timezone }: { expenses: ExpenseView[]; timezone: string }) {
  return <div className="expense-list"><div className="expense-table-heading" aria-hidden="true"><span>Expense title</span><span>Category</span><span>Related event</span><span>Expense date</span><span>Amount</span><span>Details</span></div>{expenses.map(e => <article className="expense-row" key={e.id}><h2><Link href={`/wedding/expenses/${e.id}`}>{e.title}</Link></h2><span className="expense-category">{expenseCategoryLabels[e.category as keyof typeof expenseCategoryLabels] ?? e.category}</span><span>{e.event ? `${e.event.name}${e.event.available ? "" : " · Unavailable"}` : "Wedding-wide"}</span><time dateTime={e.expenseDate}>{eventDate(e.expenseDate, timezone)}</time><strong>{expenseMoney(e.amountMinor, e.currency)}</strong><Link className="expense-view-link" href={`/wedding/expenses/${e.id}`}>View details →</Link></article>)}</div>;
}
export function ExpenseDashboard({ summary }: { summary: ExpenseSummary | null }) {
  return <section className="workspace-panel expense-dashboard"><div className="workspace-panel-heading"><h2>Wedding spending</h2><Link href="/wedding/expenses">View expenses →</Link></div>{summary ? <ExpenseMetrics summary={summary} /> : <p>Spending information could not be loaded. <Link href="/wedding/expenses">Open expenses to retry.</Link></p>}</section>;
}
