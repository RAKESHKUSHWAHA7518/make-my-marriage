import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { expenseChoices, expenseSummary, listExpenses } from "@/modules/expenses/service";
import { expenseQuerySchema } from "@/modules/expenses/schema";
import { ExpenseMetrics, ExpenseRows } from "@/components/expenses/expense-display";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
export const dynamic = "force-dynamic";
export const metadata = { title: "Expenses | Make My Marriage" };
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, wedding } = await eventWorkspace(), raw = await searchParams;
  const query = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  const parsed = expenseQuerySchema.safeParse(query);
  if (!parsed.success || Object.values(raw).some(v => Array.isArray(v))) return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="expenses"><main className="workspace-main"><h1>Check your expense filters</h1><p>Use a valid category, event and date range.</p><Link className="button button-primary" href="/wedding/expenses">Clear filters</Link></main></WorkspaceShell>;
  const { category, eventId, from, to } = parsed.data;
  const [page, summary, events] = await Promise.all([listExpenses(user, wedding.id, query), expenseSummary(user, wedding.id, { category, eventId, from, to }), expenseChoices(user, wedding.id)]);
  const next = new URLSearchParams(query); if (page.pagination.nextCursor) next.set("cursor", page.pagination.nextCursor);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="expenses"><main className="workspace-main expenses-page">
    <header className="event-page-heading"><div><span className="wedding-kicker">Wedding spending</span><h1>Expenses</h1><p>Keep track of your wedding spending.</p></div>{wedding.state === "active" && <Link className="button button-primary" href="/wedding/expenses/new">+ Add expense</Link>}</header>
    {wedding.state !== "active" && <p className="wedding-notice">This wedding is archived. Expenses are read-only.</p>}
    <ExpenseMetrics summary={summary} canEditBudget={wedding.role === "ADMIN" && wedding.state === "active"} /><ExpenseFilters key={JSON.stringify(query)} query={query} timezone={wedding.timezone} events={events} />
    {page.data.length ? <><ExpenseRows expenses={page.data} timezone={wedding.timezone} /><p className="expense-helper">{page.data.length} entries on this page · {page.pagination.total} matching expenses. Dates shown in {wedding.timezone}.</p></> : <section className="workspace-panel event-empty"><h2>{summary.filtered ? "No matching expenses" : "No expenses recorded yet."}</h2><p>{summary.filtered ? "Try adjusting your filters." : "Start by recording an amount you have actually spent."}</p>{summary.filtered ? <Link className="button button-secondary" href="/wedding/expenses">Clear filters</Link> : wedding.state === "active" && <Link className="button button-primary" href="/wedding/expenses/new">Add expense</Link>}</section>}
    {page.pagination.nextCursor && <Link className="button button-secondary" href={"/wedding/expenses?" + next}>Next page →</Link>}{query.cursor && <Link className="button button-secondary" href={"/wedding/expenses?" + new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([k]) => k !== "cursor")))}>First page</Link>}
  </main></WorkspaceShell>;
}
