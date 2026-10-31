"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { localEventInstant, eventLocalFields } from "@/modules/events/schema";
import { expenseCategories, expenseCategoryLabels } from "@/modules/expenses/schema";
export function ExpenseFilters({ query, timezone, events }: { query: Record<string, string>; timezone: string; events: { id: string; name: string }[] }) {
  const router = useRouter(), [error, setError] = useState("");
  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); const data = new FormData(e.currentTarget), params = new URLSearchParams();
    try {
      for (const field of ["category", "eventId"]) if (data.get(field)) params.set(field, String(data.get(field)));
      if (data.get("from")) params.set("from", localEventInstant(String(data.get("from")), "00:00", timezone));
      if (data.get("to")) params.set("to", new Date(Date.parse(localEventInstant(String(data.get("to")), "23:59", timezone)) + 59999).toISOString());
      if (params.has("from") && params.has("to") && params.get("from")! > params.get("to")!) throw Error("Choose a valid date range.");
      router.push("/wedding/expenses?" + params); router.refresh();
    } catch (e) { setError((e as Error).message); }
  }
  return <form className="workspace-panel expense-filters" onSubmit={apply}><label>Category<select name="category" defaultValue={query.category ?? ""}><option value="">All categories</option>{expenseCategories.map(c => <option key={c} value={c}>{expenseCategoryLabels[c]}</option>)}</select></label><label>Related event<select name="eventId" defaultValue={query.eventId ?? ""}><option value="">All events</option><option value="none">Wedding-wide</option>{query.eventId && query.eventId !== "none" && !events.some(e => e.id === query.eventId) && <option value={query.eventId}>Previous event</option>}{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>From date<input type="date" name="from" min="1000-01-01" max="9999-12-31" defaultValue={query.from ? eventLocalFields(query.from, timezone).date : ""} /></label><label>To date<input type="date" name="to" min="1000-01-01" max="9999-12-31" defaultValue={query.to ? eventLocalFields(query.to, timezone).date : ""} /></label><button className="button button-primary" type="submit">Apply filters</button><Link className="button button-secondary" href="/wedding/expenses">Clear filters</Link><p className="expense-helper">Date range uses {timezone}.</p>{error && <p className="event-field-error" role="alert">{error}</p>}</form>;
}
