"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { eventLocalFields, localEventInstant } from "@/modules/events/schema";
import { taskStatuses, taskStatusLabels } from "@/modules/tasks/schema";
import type { TaskChoices } from "@/modules/tasks/service";
export function TaskFilters({ choices, query, timezone }: { choices: TaskChoices; query: Record<string, string>; timezone: string }) {
  const router = useRouter(), [error, setError] = useState("");
  const before = query.dueBefore ? eventLocalFields(query.dueBefore, timezone) : null;
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const data = new FormData(event.currentTarget), params = new URLSearchParams();
    for (const key of ["status", "assigneeUserId", "eventId"]) { const value = String(data.get(key) ?? ""); if (value) params.set(key, value); }
    const deadline = String(data.get("deadline") ?? "");
    if (deadline) { try { params.set("dueBefore", localEventInstant(deadline.slice(0, 10), deadline.slice(11), timezone)); } catch (e) { setError((e as Error).message); return; } }
    router.push("/wedding/tasks?" + params.toString());
  }
  return <form className="workspace-panel task-filters" onSubmit={apply}>
    <label>Status<select name="status" defaultValue={query.status ?? ""}><option value="">All statuses</option>{taskStatuses.map((s) => <option key={s} value={s}>{taskStatusLabels[s]}</option>)}</select></label>
    <label>Assignee<select name="assigneeUserId" defaultValue={query.assigneeUserId ?? ""}><option value="">All assignees</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>{choices.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>Event<select name="eventId" defaultValue={query.eventId ?? ""}><option value="">All events</option><option value="none">Whole wedding</option>{choices.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    <label>Due before ({timezone})<input type="datetime-local" name="deadline" defaultValue={before ? `${before.date}T${before.time}` : ""} /></label>
    <button className="button button-primary" type="submit">Apply filters</button><Link href="/wedding/tasks" className="button button-secondary">Clear filters</Link>
    {error && <p role="alert">{error}</p>}
  </form>;
}
