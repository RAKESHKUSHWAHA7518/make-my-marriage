"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ExpenseView } from "@/modules/expenses/service";
import { expenseMoney } from "@/modules/expenses/schema";

export function RemoveExpense({ weddingId, expense }: { weddingId: string; expense: ExpenseView }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null), locked = useRef(false);
  const submission = useRef<{ key: string; version: number } | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [blocked, setBlocked] = useState(false), [uncertain, setUncertain] = useState(false);
  async function remove() {
    if (locked.current || blocked) return;
    locked.current = true; setPending(true); setError("");
    const saved = submission.current ??= { key: crypto.randomUUID(), version: expense.version };
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/expenses/${expense.id}/remove`, { method: "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key }, body: JSON.stringify({ expectedVersion: saved.version }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && result.data?.id === expense.id && result.data.deletedAt) { dialog.current?.close(); router.replace("/wedding/expenses"); router.refresh(); return; }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      setError(result.error?.message ?? "This expense could not be removed."); setBlocked(true); setUncertain(false);
    } catch { setUncertain(true); setError("We couldn’t confirm removal. Retry to check the same request. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  return <><button type="button" className="button button-secondary" onClick={() => dialog.current?.showModal()}>Remove expense</button><dialog ref={dialog} className="wedding-dialog wedding-card" aria-labelledby="remove-expense-title" onCancel={e => { if (pending) e.preventDefault(); }}><h2 id="remove-expense-title">Remove this expense?</h2><p><strong>{expense.title}</strong> · {expenseMoney(expense.amountMinor, expense.currency)}</p><p>This expense will no longer count towards your recorded spending. Its history will be retained.</p>{error && <p className="event-form-error" role="alert">{error}</p>}{blocked && <Link href="/wedding/expenses">Review expenses</Link>}<div className="event-form-actions"><button className="button button-secondary" disabled={pending} onClick={() => dialog.current?.close()} autoFocus>{uncertain ? "Close and check expenses" : "Keep expense"}</button><button className="button button-primary" disabled={pending || blocked} onClick={remove}>{pending ? "Removing expense…" : uncertain ? "Retry removal" : "Remove expense"}</button></div></dialog></>;
}
