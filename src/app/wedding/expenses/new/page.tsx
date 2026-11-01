import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { expenseChoices, expensesReady, expenseVendorChoices, expenseVendorLinksEnabled } from "@/modules/expenses/service";
import { ExpenseForm } from "@/components/expenses/expense-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Add expense | Make My Marriage" };
export default async function AddExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, wedding } = await eventWorkspace(); await expensesReady();
  const [events, vendors, linksEnabled, query] = await Promise.all([expenseChoices(user, wedding.id), expenseVendorChoices(user, wedding.id), expenseVendorLinksEnabled(), searchParams]);
  const raw = query.vendorId, requested = typeof raw === "string" && /^[a-f0-9]{24}$/.test(raw) ? raw : undefined;
  const selected = linksEnabled && requested && vendors.some(v => v.id === requested) ? requested : undefined;
  const invalidSelection = Object.keys(query).some(k => k !== "vendorId") || (raw !== undefined && !selected);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="expenses"><main className="workspace-main expenses-page"><Link className="wedding-back" href="/wedding/expenses">← Back to expenses</Link><header className="event-page-heading"><div><span className="wedding-kicker">Financial records</span><h1>Add expense</h1><p>Record an amount you have actually spent.</p></div></header>{wedding.state !== "active" ? <p className="wedding-notice">This wedding is archived. Expenses are read-only.</p> : <div className="expense-editor-layout"><div>{invalidSelection && <p className="wedding-notice">The requested vendor cannot be preselected. Choose an active saved vendor or record an unlinked expense. No other fields have been prefilled.</p>}<ExpenseForm weddingId={wedding.id} currency={wedding.currency} timezone={wedding.timezone} events={events} vendors={vendors} vendorLinksEnabled={linksEnabled} defaultVendorId={selected || undefined} /></div><aside className="workspace-panel expense-editor-aside"><h2>A clear record</h2><p>One entry for each actual expenditure.</p><dl><dt>Wedding currency</dt><dd>{wedding.currency}</dd><dt>Time zone</dt><dd>{wedding.timezone}</dd></dl><p>For a cost shared across events, choose Wedding-wide and record it once.</p><p>Only your planning family can see these records.</p></aside></div>}</main></WorkspaceShell>;
}
