"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { localEventInstant, eventLocalFields } from "@/modules/events/schema";
import { createExpenseSchema, expenseCategories, expenseCategoryLabels, expenseAmount, expenseInputAmount } from "@/modules/expenses/schema";
import type { ExpenseView } from "@/modules/expenses/service";

export function ExpenseForm({ weddingId, currency, timezone, events, initial }: { weddingId: string; currency: string; timezone: string; events: { id: string; name: string }[]; initial?: ExpenseView }) {
  const router = useRouter(), back = initial ? `/wedding/expenses/${initial.id}` : "/wedding/expenses";
  const form = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false), leaving = useRef(false), reloadRequested = useRef(false), destination = useRef(back);
  const submission = useRef<{ key: string; input: unknown } | null>(null);
  const [dirty, setDirty] = useState(false), [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(""), [fields, setFields] = useState<Record<string, string>>({});
  const [signedOut, setSignedOut] = useState(false);
  const savedDate = initial ? eventLocalFields(initial.expenseDate, timezone) : undefined;
  useUnsavedNavigation({ dirty, pending, leaving, destination, reloadRequested, dialog });
  const attrs = (name: string) => ({ "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `expense-error-${name}` : undefined });
  const fieldError = (name: string) => fields[name] ? <small className="event-field-error" id={`expense-error-${name}`}>{fields[name]}</small> : null;
  function focusError() { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current || blocked) return;
    setError(""); setFields({});
    if (!submission.current) {
      const data = new FormData(event.currentTarget), value = (name: string) => String(data.get(name) ?? "").trim();
      const errors: Record<string, string> = {};
      let amountMinor = "", expenseDate = "";
      try { amountMinor = expenseAmount(value("amount")); } catch (e) { errors.amountMinor = (e as Error).message; }
      try { expenseDate = initial && value("date") === savedDate?.date && value("time") === savedDate?.time ? initial.expenseDate : localEventInstant(value("date"), value("time"), timezone); } catch (e) { errors.expenseDate = (e as Error).message; }
      const input = { title: value("title"), amountMinor, currency, expenseDate, category: value("category"), eventId: value("eventId") || undefined, notes: value("notes") || undefined };
      const parsed = createExpenseSchema.safeParse(input);
      if (!parsed.success) for (const issue of parsed.error.issues) if (!errors[issue.path.join(".")]) errors[issue.path.join(".")] = issue.message;
      if (Object.keys(errors).length || !parsed.success) { setFields(errors); setError("Please check the highlighted fields."); focusError(); return; }
      submission.current = { key: crypto.randomUUID(), input: initial ? { ...parsed.data, expectedVersion: initial.version, eventId: input.eventId ?? null, notes: input.notes ?? null } : parsed.data };
      setDirty(true);
    }
    const saved = submission.current; locked.current = true; setPending(true);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/expenses${initial ? `/${initial.id}` : ""}`, { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key, "X-MMM-Wedding-Timezone": timezone }, body: JSON.stringify(saved.input), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && /^[a-f0-9]{24}$/.test(result.data?.id) && (!initial || result.data.id === initial.id)) {
        leaving.current = true; setDirty(false); setUncertain(false);
        router.replace(result.data.deletedAt ? "/wedding/expenses" : `/wedding/expenses/${result.data.id}`); router.refresh(); return;
      }
      // A 429 can occur before the server reconciles an earlier committed save.
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      submission.current = null; setUncertain(false);
      setError(result.error?.message ?? "This expense could not be saved.");
      setSignedOut(response.status === 401);
      if ([401, 403, 404, 409].includes(response.status)) setBlocked(true);
      const errors: Record<string, string> = {};
      for (const issue of result.error?.fields ?? []) errors[issue.path] = issue.message;
      if (result.error?.code === "EVENT_UNAVAILABLE") errors.eventId = result.error.message;
      setFields(errors); focusError();
    } catch {
      setUncertain(true); setError("We couldn’t confirm whether your expense was saved. Retry to check and finish this save. Your original entries are preserved. If rate-limited, wait before retrying.");
    } finally { locked.current = false; setPending(false); }
  }

  return <>
    <form ref={form} className="expense-form" onSubmit={save} noValidate onChange={() => { setDirty(true); setFields({}); }}>
      {error && <div className="event-form-error" role="alert"><strong>{error}</strong>{blocked && <><p>Your entries remain visible. Review the latest saved details before continuing.</p>{signedOut ? <Link href="/login">Sign in again</Link> : <button type="button" className="button button-secondary" onClick={() => { reloadRequested.current = true; dialog.current?.showModal(); }}>Review latest details</button>}</>}</div>}
      <fieldset disabled={pending || uncertain || blocked}>
        <section className="workspace-panel expense-form-section"><h2><span>1</span>Expense details</h2>
          <label><span>Expense title <b>*</b></span><input name="title" defaultValue={initial?.title ?? ""} maxLength={200} required placeholder="e.g. Venue advance" {...attrs("title")} />{fieldError("title")}</label>
          <div className="expense-form-columns"><label><span>Category <b>*</b></span><select name="category" defaultValue={initial?.category ?? ""} required {...attrs("category")}><option value="" disabled>Select category</option>{expenseCategories.map(c => <option key={c} value={c}>{expenseCategoryLabels[c]}</option>)}</select>{fieldError("category")}</label>
          <label><span>Amount <b>*</b></span><div className="expense-amount-input"><span>{currency}</span><input name="amount" inputMode="decimal" defaultValue={initial ? expenseInputAmount(initial.amountMinor) : ""} placeholder="0.00" maxLength={24} required {...attrs("amountMinor")} /></div>{fieldError("amountMinor")}</label></div>
          <p className="expense-helper-panel">Use the amount actually spent, not an estimate. Enter normal currency units, such as 5000.50.<br />Currency is inherited from your wedding: {currency}.</p>
        </section>
        <section className="workspace-panel expense-form-section"><h2><span>2</span>Date &amp; association</h2>
          <div className="expense-form-columns"><label><span>Expense date <b>*</b></span><input type="date" name="date" defaultValue={savedDate?.date ?? ""} min="1000-01-01" max="9999-12-31" required {...attrs("expenseDate")} /></label><label><span>Expense time <b>*</b></span><input type="time" name="time" defaultValue={savedDate?.time ?? ""} required {...attrs("expenseDate")} /></label></div>{fieldError("expenseDate")}
          <p className="expense-helper">Wedding time zone: {timezone}. Times use this time zone.</p>
          <label><span>Related event <small>(Optional)</small></span><select name="eventId" defaultValue={initial?.eventId ?? ""} {...attrs("eventId")}><option value="">Wedding-wide</option>{initial?.eventId && !events.some(e => e.id === initial.eventId) && <option value={initial.eventId}>{initial.event?.name ?? "Previous event"} · Unavailable</option>}{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>{fieldError("eventId")}</label>
          <p className="expense-helper">Choose an event, or leave this as wedding-wide. Record a shared expense only once.</p>
        </section>
        <section className="workspace-panel expense-form-section"><h2><span>3</span>Private notes</h2><label><span>Notes <small>(Optional)</small></span><textarea name="notes" rows={5} maxLength={10000} defaultValue={initial?.notes ?? ""} placeholder="Add details for your planning family…" {...attrs("notes")} />{fieldError("notes")}</label><p className="expense-helper">Visible only to your wedding’s planning family.</p></section>
      </fieldset>
      <footer className="expense-form-actions"><Link href={back} className="button button-secondary" aria-disabled={pending}>Cancel</Link><button className="button button-primary" disabled={pending || blocked} type="submit">{pending ? initial ? "Saving changes…" : "Saving expense…" : uncertain ? "Retry saving" : initial ? "Save changes" : "Save expense"}</button></footer>
    </form>
    <dialog ref={dialog} className="wedding-dialog event-discard-dialog" aria-labelledby="discard-expense-title"><h2 id="discard-expense-title">Leave your unsaved entries?</h2><p>Your entries will be lost.{uncertain ? " An earlier save may have succeeded. Check the expense list before creating another entry." : ""}</p><div className="event-form-actions"><button className="button button-secondary" autoFocus onClick={() => { reloadRequested.current = false; dialog.current?.close(); }}>Keep reviewing</button><button className="button button-primary" onClick={() => { leaving.current = true; setDirty(false); dialog.current?.close(); if (reloadRequested.current) window.location.reload(); else router.push(destination.current); }}>Leave this form</button></div></dialog>
  </>;
}
