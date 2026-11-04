"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { checklistSchema, type ChecklistItem } from "@/modules/tasks/schema";
import type { TaskView } from "@/modules/tasks/service";
import { ChecklistRows } from "./checklist-rows";
export function TaskChecklist({ task, weddingId, enabled, readOnly, edit = false }: { task: TaskView; weddingId: string; enabled: boolean; readOnly: boolean; edit?: boolean }) {
  const router = useRouter(), form = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), version = useRef(task.version), leaving = useRef(false), reloadRequested = useRef(false), destination = useRef(`/wedding/tasks/${task.id}`);
  const submission = useRef<{ body: string; key: string; expectedVersion: number } | null>(null);
  const [items, setItems] = useState(task.checklist), [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [fields, setFields] = useState<Record<string, string>>({});
  const dirty = edit && JSON.stringify(items) !== JSON.stringify(task.checklist), disabled = !enabled || readOnly || pending || uncertain || blocked;
  useUnsavedNavigation({ dirty: dirty || uncertain, pending, leaving, destination, reloadRequested, dialog });
  async function save(candidate: ChecklistItem[]) {
    if (!enabled || readOnly || locked.current || blocked || (edit && !dirty && !submission.current)) return;
    setError(""); setFields({}); setNotice("");
    if (!submission.current) {
      const parsed = checklistSchema.safeParse(candidate);
      if (!parsed.success) { setFields(Object.fromEntries(parsed.error.issues.map(i => ["checklist" + (i.path.length ? "." + i.path.join(".") : ""), i.message]))); setError("Check the highlighted checklist items."); requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
      submission.current = { body: JSON.stringify({ checklist: parsed.data, expectedVersion: version.current }), key: crypto.randomUUID(), expectedVersion: version.current };
    }
    const saved = submission.current; locked.current = true; setPending(true);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key }, body: saved.body, signal: AbortSignal.timeout(20000) });
      const result = await response.json(), checked = checklistSchema.safeParse(result.data?.checklist);
      if (response.ok && result.data?.id === task.id && Number.isInteger(result.data.version) && result.data.version > saved.expectedVersion && checked.success) {
        submission.current = null; setUncertain(false); version.current = result.data.version; setItems(checked.data);
        if (edit) { leaving.current = true; setBlocked(true); router.replace(`/wedding/tasks/${task.id}?updated=1`); router.refresh(); }
        else setNotice("Checklist save confirmed. Refresh task details to see any other changes.");
        return;
      }
      if (response.ok || response.status === 429 || response.status >= 500) throw Error("Unconfirmed save");
      submission.current = null; setUncertain(false); setError(result.error?.message ?? "The checklist could not be saved.");
      if ([401, 403, 404, 409].includes(response.status)) setBlocked(true);
      setFields(Object.fromEntries((result.error?.fields ?? []).map((i: { path: string; message: string }) => [i.path, i.message])));
    } catch { setUncertain(true); setError("We couldn’t confirm whether your checklist changes were saved. Retry to check. If rate-limited, wait before retrying."); }
    finally { locked.current = false; setPending(false); }
  }
  const progress = <><div className="task-checklist-heading"><h2>Checklist</h2>{!!items.length && <span className="task-badge">{items.filter(i => i.done).length} of {items.length} completed</span>}{!edit && enabled && !readOnly && !pending && !uncertain && !blocked && <Link className="button button-secondary" href={`/wedding/tasks/${task.id}/checklist`}>{items.length ? "Edit checklist" : "Add checklist items"}</Link>}</div>{!!items.length && <progress className="task-checklist-progress" max={items.length} value={items.filter(i => i.done).length} aria-label="Checklist items completed" />}<p className="task-checklist-guidance">Checklist progress does not change this task’s status.</p></>;
  return <><section className="workspace-panel task-checklist" aria-busy={pending}>{progress}{!enabled && <p className="wedding-notice">Checklist editing is awaiting activation. Your saved task details remain available.</p>}{readOnly && <p className="wedding-notice">This wedding is archived. Checklists are read-only.</p>}
    {error && <p className="event-form-error" role="alert">{error}</p>}{notice && <p role="status" className="task-helper">{notice}</p>}
    {edit ? <form ref={form} noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); void save(items); }}><ChecklistRows items={items} onChange={setItems} fields={fields} completion disabled={disabled} /><div className="event-form-actions"><Link className="button button-secondary" href={`/wedding/tasks/${task.id}`}>Cancel</Link><button className="button button-primary" type="submit" disabled={!enabled || readOnly || pending || blocked || (!dirty && !uncertain)}>{pending ? "Saving checklist…" : uncertain ? "Retry same save" : "Save checklist"}</button></div></form>
      : <>{!items.length && <p className="task-checklist-empty">No checklist items yet.</p>}<ul className="task-checklist-items">{items.map(i => <li key={i.id} className={i.done ? "task-checklist-done" : ""}><label>{readOnly || !enabled || blocked ? <span aria-hidden="true">{i.done ? "✓" : "○"}</span> : <input type="checkbox" checked={i.done} disabled={disabled} onChange={e => { void save(items.map(item => item.id === i.id ? { ...item, done: e.target.checked } : item)); }} />}<span>{i.text}{(readOnly || !enabled || blocked) && <small>{i.done ? "Completed" : "Not completed"}</small>}</span></label></li>)}</ul>{pending && <p role="status">Saving checklist…</p>}{uncertain && <button type="button" className="button button-primary" disabled={pending} onClick={() => save(items)}>Retry same save</button>}{notice && <button type="button" className="button button-secondary" onClick={() => window.location.reload()}>Refresh task details</button>}</>}
    {blocked && <div className="task-checklist-recovery"><p>Your local checklist stays visible. Reload the task before making further changes.</p><button type="button" className="button button-secondary" onClick={() => { reloadRequested.current = true; dialog.current?.showModal(); }}>Reload latest</button><Link href="/login">Sign in</Link></div>}
  </section><dialog ref={dialog} className="wedding-dialog" aria-labelledby="discard-checklist-title"><h2 id="discard-checklist-title">Discard checklist changes?</h2><p>Your unsaved checklist changes will be lost.{uncertain && " An earlier request may already have saved; review the latest task before trying again."}</p><div className="event-form-actions"><button type="button" className="button button-secondary" onClick={() => dialog.current?.close()}>Keep editing</button><button type="button" className="button button-primary" onClick={() => { leaving.current = true; if (reloadRequested.current) window.location.reload(); else router.push(destination.current); }}>Discard changes</button></div></dialog></>;
}
