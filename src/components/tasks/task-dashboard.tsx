import Link from "next/link";
import type { TaskSummary } from "@/modules/tasks/service";
import { TaskCounts, TaskDue } from "./task-display";
import { TaskRetry } from "./task-retry";
export function TaskDashboard({ summary, timezone, archived }: { summary: TaskSummary | null; timezone: string; archived: boolean }) {
  return <section className="workspace-panel task-dashboard">
    <div className="workspace-panel-heading"><h2>Wedding tasks &amp; next steps</h2><Link href="/wedding/tasks">View all tasks →</Link>{!archived && summary && <Link className="button button-primary" href="/wedding/tasks/new">+ Create task</Link>}</div>
    {!summary ? <div className="workspace-empty"><h3>Tasks are temporarily unavailable</h3><p>The rest of your workspace is still available.</p><TaskRetry /></div> : <>
      <TaskCounts summary={summary} />
      {!summary.total ? <div className="workspace-empty"><h3>Share the next steps</h3><p>Add tasks, assign your planning family and keep track of what needs doing.</p>{!archived && <Link href="/wedding/tasks/new" className="button button-primary">Create task</Link>}</div>
        : !summary.upcoming.length ? <p>No upcoming deadlines. View all tasks to see your full list.</p>
          : <><h3>Upcoming work</h3><ul className="task-dashboard-list">{summary.upcoming.map((task) => <li key={task.id}><strong><Link href={`/wedding/tasks/${task.id}`}>{task.title} →</Link></strong><small>{task.assignee?.name ?? "Unassigned"}{task.assignee && !task.assignee.active ? " · Inactive" : ""}</small><TaskDue task={task} timezone={timezone} now={new Date()} /><small>{task.event?.name ?? "Whole wedding"}</small></li>)}</ul></>}
    </>}
  </section>;
}
