import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { expenseFor } from "@/modules/expenses/service";
import { expenseMoney, expenseCategoryLabels } from "@/modules/expenses/schema";
import { eventDate, eventTime } from "@/modules/events/schema";
import { RemoveExpense } from "@/components/expenses/remove-expense";
export const dynamic = "force-dynamic";
export const metadata = { title: "Expense details | Make My Marriage" };
export default async function ExpensePage({ params }: { params: Promise<{ expenseId: string }> }) {
  const { user, wedding } = await eventWorkspace(), expense = await expenseFor(user, wedding.id, (await params).expenseId);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="expenses"><main className="workspace-main expenses-page"><Link className="wedding-back" href="/wedding/expenses">← Back to expenses</Link>{!expense || expense.deletedAt ? <section className="workspace-panel event-empty"><h1>This expense is no longer available.</h1><Link className="button button-secondary" href="/wedding/expenses">Back to expenses</Link></section> : <><header className="event-page-heading"><div><span className="wedding-kicker">Saved expense</span><h1>{expense.title}</h1><p>Private to your wedding’s planning family.</p></div></header>{wedding.state !== "active" && <p className="wedding-notice">This wedding is archived. Expenses are read-only.</p>}<section className="workspace-panel expense-details"><span className="expense-category">{expenseCategoryLabels[expense.category as keyof typeof expenseCategoryLabels] ?? expense.category}</span><h2>{expenseMoney(expense.amountMinor, expense.currency)}</h2><dl><div><dt>Expense date and time</dt><dd>{eventDate(expense.expenseDate, wedding.timezone)} · {eventTime(expense.expenseDate, wedding.timezone)}<small>{wedding.timezone}</small></dd></div><div><dt>Related event</dt><dd>{expense.event ? `${expense.event.name}${expense.event.available ? "" : " · Unavailable"}` : "Wedding-wide"}</dd></div><div><dt>Currency</dt><dd>{expense.currency}</dd></div>{expense.notes && <div className="expense-notes"><dt>Private notes</dt><dd>{expense.notes}</dd></div>}</dl></section>{wedding.state === "active" && <div className="expense-form-actions"><RemoveExpense weddingId={wedding.id} expense={expense} /><Link className="button button-primary" href={`/wedding/expenses/${expense.id}/edit`}>Edit expense</Link></div>}</>}</main></WorkspaceShell>;
}
