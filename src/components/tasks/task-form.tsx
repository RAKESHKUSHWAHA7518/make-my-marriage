"use client";
import Link from "next/link";
import { useUnsavedNavigation } from "@/components/weddings/use-unsaved-navigation";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { localEventInstant, eventLocalFields } from "@/modules/events/schema";
import { createTaskSchema, patchTaskSchema, taskStatuses, taskPriorities, taskStatusLabels, taskPriorityLabels } from "@/modules/tasks/schema";
import type { TaskView, TaskChoices } from "@/modules/tasks/service";
import { WeddingIcon } from "@/components/weddings/wedding-icon";

export function TaskForm({ weddingId, timezone, initial, choices, statusOnly = false }: { weddingId: string; timezone: string; initial?: TaskView; choices: TaskChoices; statusOnly?: boolean }) {
  const back = initial ? `/wedding/tasks/${initial.id}` : "/wedding/tasks";
  const due = initial?.dueAt ? eventLocalFields(initial.dueAt, timezone) : undefined;
  const reloadRequested = useRef(false);
  const leaving = useRef(false);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const destination = useRef(back);
  const locked = useRef(false);
  const submission = useRef<{ key: string; input: unknown } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  useUnsavedNavigation({ dirty, pending, leaving, destination, reloadRequested, dialog: discardDialog });

  const errorFor = (name: string) => fields[name] ? <small id={`error-${name}`} className="event-field-error">{fields[name]}</small> : null;
  const attrs = (name: string) => ({ "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `error-${name}` : undefined });
  function focusError() { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || blocked || (initial && !dirty && !submission.current)) return;
    setError(""); setFields({});
    if (!submission.current) {
      const data = new FormData(event.currentTarget), value = (name: string) => { const control = event.currentTarget.elements.namedItem(name); return String(control instanceof HTMLSelectElement ? control.value : data.get(name) ?? "").trim(); };
      const errors: Record<string, string> = {};
      let dueAt: string | undefined;
      if (!statusOnly) {
        if (value("dueDate") || value("dueTime")) {
          if (!value("dueDate") || !value("dueTime")) errors.dueAt = "Enter both a due date and time, or clear both.";
          else try { dueAt = initial?.dueAt && value("dueDate") === due?.date && value("dueTime") === due?.time ? initial.dueAt : localEventInstant(value("dueDate"), value("dueTime"), timezone); } catch (e) { errors.dueAt = (e as Error).message; }
        }
        for (const name of ["dueDate", "dueTime"]) { const control = event.currentTarget.elements.namedItem(name); if (control instanceof HTMLInputElement && control.validity.badInput) errors.dueAt = "Enter a complete, valid deadline."; }
        if (value("assigneeUserId") && !choices.members.some((m) => m.id === value("assigneeUserId"))) errors.assigneeUserId = "Select an active member or choose Unassigned.";
        if (value("eventId") && !choices.events.some((e) => e.id === value("eventId"))) errors.eventId = "Select an available event or choose Whole wedding.";
      }
      if (Object.keys(errors).length) { setFields(errors); setError("Please check the highlighted fields."); focusError(); return; }
      const input = statusOnly ? { status: value("status"), expectedVersion: initial!.version } : { title: value("title"), description: value("description") || undefined, status: value("status"), priority: value("priority"), eventId: value("eventId") || undefined, assigneeUserId: value("assigneeUserId") || undefined, dueAt };
      const parsed = statusOnly ? patchTaskSchema.safeParse(input) : createTaskSchema.safeParse(input);
      if (!parsed.success) { for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message; setFields(errors); setError("Please check the highlighted fields."); focusError(); return; }
      submission.current = { key: crypto.randomUUID(), input: statusOnly ? parsed.data : initial ? { ...parsed.data, expectedVersion: initial.version, description: value("description") || null, eventId: value("eventId") || null, assigneeUserId: value("assigneeUserId") || null, dueAt: dueAt ?? null } : parsed.data };
    }
    const saved = submission.current;
    locked.current = true; setPending(true);
    try {
      const response = await fetch(`/api/v1/weddings/${weddingId}/tasks${initial ? `/${initial.id}` : ""}`, { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": saved.key, "X-MMM-Wedding-Timezone": timezone }, body: JSON.stringify(saved.input), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (response.ok && /^[a-f0-9]{24}$/.test(result.data?.id) && (!initial || result.data.id === initial.id)) {
        leaving.current = true; setDirty(false); setUncertain(false);
        router.replace(`/wedding/tasks/${result.data.id}?${statusOnly ? "statusUpdated" : initial ? "updated" : "created"}=1`); router.refresh(); return;
      }
      // A rate-limited retry may precede reconciliation of an earlier committed save.
      // Keep its immutable input/key and the retry-only state until confirmed.
      if (response.ok || response.status === 429 || response.status >= 500) throw Error();
      submission.current = null; setUncertain(false);
      setError(result.error?.message ?? "The task could not be saved. Please check your entries.");
      const codes = ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "WEDDING_ARCHIVED", "WEDDING_TIMEZONE_CHANGED", "NOT_FOUND", "UNAUTHENTICATED", "FORBIDDEN"];
      if (codes.includes(result.error?.code)) setBlocked(true);
      if (result.error?.code === "ASSIGNEE_UNAVAILABLE") setFields({ assigneeUserId: result.error.message });
      if (result.error?.code === "EVENT_UNAVAILABLE") setFields({ eventId: result.error.message });
      const errors: Record<string, string> = {};
      for (const issue of result.error?.fields ?? []) errors[issue.path] = issue.message;
      if (Object.keys(errors).length) setFields(errors); focusError();
    } catch {
      setUncertain(true);
      setError(initial ? "We couldn’t confirm whether your changes were saved. Check the task details or retry the same save. If rate-limited, wait before retrying." : "We could not confirm whether this task was saved. Your entries are preserved. Check the task list, or retry the same save safely.");
    } finally { locked.current = false; setPending(false); }
  }

  return <>
    <form ref={formRef} className="event-form task-form workspace-panel" noValidate onSubmit={save} onChange={() => {
      const controls = Array.from(formRef.current?.elements ?? []);
      setDirty(controls.some((control) => control instanceof HTMLInputElement ? control.type === "radio" ? control.checked !== control.defaultChecked : control.value !== control.defaultValue : control instanceof HTMLSelectElement ? Array.from(control.options).some((option) => option.selected !== option.defaultSelected) : control instanceof HTMLTextAreaElement && control.value !== control.defaultValue));
      setFields({});
    }}>
      {error && <div className="event-form-error" role="alert"><strong>{error}</strong>{uncertain && <Link href={back}>{initial ? "Check task details →" : "Check task list →"}</Link>}{blocked && <><p>Reload the latest details before continuing. Your entries will stay visible until you confirm.</p><button type="button" className="button button-secondary" onClick={() => { reloadRequested.current = true; discardDialog.current?.showModal(); }}>Reload latest details</button></>}</div>}
      <fieldset disabled={pending || uncertain || blocked}>
        {!statusOnly && <>
          <label>Task title <b>*</b><input name="title" defaultValue={initial?.title ?? ""} required maxLength={200} placeholder="e.g. Confirm the Haldi decorations" {...attrs("title")} />{errorFor("title")}</label>
          <label>Description <small>(Optional)</small><textarea name="description" defaultValue={initial?.description ?? ""} maxLength={10000} rows={5} placeholder="Add details for your planning family…" {...attrs("description")} /></label>
          <fieldset className="task-options"><legend>Priority</legend>{taskPriorities.map((priority) => <label key={priority}><input type="radio" name="priority" value={priority} defaultChecked={(initial?.priority ?? "normal") === priority} /><span>{taskPriorityLabels[priority]}</span></label>)}</fieldset>
        </>}
        <fieldset className="task-options task-status-options"><legend>{statusOnly ? "Change task status" : "Status"}</legend>{taskStatuses.map((status) => <label key={status}><input type="radio" name="status" value={status} defaultChecked={(initial?.status ?? "todo") === status} /><span>{taskStatusLabels[status]}</span></label>)}</fieldset>
        {!statusOnly && <>
          <div className="task-form-columns">
            <label>Assignee<select name="assigneeUserId" defaultValue={initial?.assigneeUserId ?? ""} {...attrs("assigneeUserId")}><option value="">Unassigned</option>{initial?.assigneeUserId && !choices.members.some((m) => m.id === initial.assigneeUserId) && <option value={initial.assigneeUserId} disabled>{initial.assignee?.name ?? "Previous assignee"} · Inactive — select another or clear</option>}{choices.members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}</select>{errorFor("assigneeUserId")}</label>
            <label>Related event<select name="eventId" defaultValue={initial?.eventId ?? ""} {...attrs("eventId")}><option value="">Whole wedding</option>{initial?.eventId && !choices.events.some((e) => e.id === initial.eventId) && <option value={initial.eventId} disabled>{initial.event?.name ?? "Previous event"} · Unavailable — select another or clear</option>}{choices.events.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.status}</option>)}</select>{errorFor("eventId")}</label>
          </div>
          <div className="task-form-columns"><label>Due date <small>(Optional)</small><input type="date" name="dueDate" defaultValue={due?.date ?? ""} min="1000-01-01" max="9999-12-31" {...attrs("dueAt")} /></label><label>Due time <small>(Optional)</small><input type="time" name="dueTime" defaultValue={due?.time ?? ""} {...attrs("dueAt")} /></label></div>{errorFor("dueAt")}
          <p className="task-helper">Times are shown in {timezone}. Changing an event date won’t change this task’s deadline. Leave both fields blank if no deadline is set.</p>
        </>}
      </fieldset>
      <footer className="event-form-footer"><p><WeddingIcon name="lock" />{statusOnly ? "Cancelled tasks remain available in planning history." : "Only your wedding’s planning family can view this task."}</p><div className="event-form-actions">{!statusOnly && <Link href={back} className="button button-secondary" aria-disabled={pending}>Cancel</Link>}<button className="button button-primary" type="submit" disabled={pending || blocked || (!!initial && !dirty && !uncertain)}>{pending ? statusOnly ? "Updating status…" : initial ? "Saving changes…" : "Creating task…" : uncertain ? "Retry saving" : statusOnly ? "Update status" : initial ? "Save changes" : "Create task"}</button></div></footer>
    </form>
    <dialog ref={discardDialog} className="wedding-dialog event-discard-dialog" aria-labelledby="discard-task-title"><h2 id="discard-task-title">{initial ? "Discard your changes?" : "Discard this task?"}</h2><p>Your unsaved entries will be lost.{uncertain ? " An earlier save may have succeeded; check the saved details before continuing." : ""}</p><div className="event-form-actions"><button type="button" className="button button-secondary" autoFocus onClick={() => { reloadRequested.current = false; discardDialog.current?.close(); }}>Keep editing</button><button type="button" className="button button-primary" onClick={() => { leaving.current = true; setDirty(false); discardDialog.current?.close(); if (reloadRequested.current) window.location.reload(); else router.push(destination.current); }}>Discard changes</button></div></dialog>
  </>;
}
