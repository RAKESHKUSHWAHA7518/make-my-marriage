import Link from "next/link";
import { eventDate, eventTime } from "@/modules/events/schema";
import { taskOverdue, taskStatusLabels, taskPriorityLabels } from "@/modules/tasks/schema";
import type { TaskView, TaskSummary } from "@/modules/tasks/service";
export function TaskCounts({ summary }: { summary: TaskSummary }) {
  return <><div className="task-counts">{Object.entries(summary.counts).map(([status, count]) => <div key={status}><small>{taskStatusLabels[status as keyof typeof taskStatusLabels]}</small><strong>{count}</strong></div>)}<div className="task-overdue"><small>Overdue</small><strong>{summary.overdue}</strong></div></div><p className="task-helper">Overdue tasks are included in To do or In progress.</p></>;
}
export function TaskDue({ task, timezone, now }: { task: TaskView; timezone: string; now: Date }) {
  return <span className={taskOverdue(task, now) ? "task-overdue" : ""}>{taskOverdue(task, now) && <b className="task-badge">Overdue</b>}{task.dueAt ? `${eventDate(task.dueAt, timezone)}, ${eventTime(task.dueAt, timezone)}` : "No due date"}</span>;
}
export function TaskRows({ tasks, timezone, now }: { tasks: TaskView[]; timezone: string; now: Date }) {
  return <div className="task-list"><div className="task-row task-table-heading" aria-hidden="true"><span>Task</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due date</span><span>Related event</span></div>{tasks.map((task) => <article className={`task-row task-row-${task.status}`} key={task.id}>
    <h2><Link href={`/wedding/tasks/${task.id}`}>{task.title} <span aria-hidden="true">→</span></Link></h2>
    <span className="task-badge">{taskStatusLabels[task.status]}</span><span className="task-badge">{taskPriorityLabels[task.priority]}</span>
    <span>{task.assignee?.name ?? "Unassigned"}{task.assignee && !task.assignee.active && <small> · Inactive</small>}</span>
    <TaskDue task={task} timezone={timezone} now={now} /><span>{task.event?.name ?? "Whole wedding"}{task.event && !task.event.available && <small> · Unavailable</small>}</span>
  </article>)}</div>;
}
