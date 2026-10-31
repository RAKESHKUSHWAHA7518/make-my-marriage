import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { expenseChoices, expenseFor } from "@/modules/expenses/service";
import { ExpenseForm } from "@/components/expenses/expense-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Edit expense | Make My Marriage" };
export default async function EditExpensePage({ params }: { params: Promise<{ expenseId: string }> }) {
  const { user, wedding } = await eventWorkspace(), expense = await expenseFor(user, wedding.id, (await params).expenseId), events = await expenseChoices(user, wedding.id);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="expenses"><main className="workspace-main expenses-page"><Link className="wedding-back" href="/wedding/expenses">← Back to expenses</Link><header className="event-page-heading"><div><h1>Edit expense</h1><p>Keep your spending records accurate.</p></div></header>{!expense || expense.deletedAt ? <p className="wedding-notice">This expense is no longer available.</p> : wedding.state !== "active" ? <p className="wedding-notice">This wedding is archived. Expenses are read-only.</p> : <ExpenseForm key={`${expense.id}:${expense.version}`} weddingId={wedding.id} currency={wedding.currency} timezone={wedding.timezone} events={events} initial={expense} />}</main></WorkspaceShell>;
}
