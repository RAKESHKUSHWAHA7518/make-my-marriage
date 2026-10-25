import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { taskFor } from "@/modules/tasks/service";
import { taskStatusLabels, taskPriorityLabels } from "@/modules/tasks/schema";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskDue } from "@/components/tasks/task-display";
export const dynamic="force-dynamic";
export const metadata={title:"Task details | Make My Marriage"};
export default async function TaskPage({params,searchParams}:{params:Promise<{taskId:string}>;searchParams:Promise<{created?:string;updated?:string;statusUpdated?:string}>}){const {user,wedding}=await eventWorkspace();const task=await taskFor(user,wedding.id,(await params).taskId),query=await searchParams;
return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="tasks"><main className="workspace-main tasks-page"><Link className="wedding-back" href="/wedding/tasks">← Back to tasks</Link>{!task ? <section className="workspace-panel event-empty"><h1>Task unavailable</h1><p>This task is unavailable, or you no longer have permission to view it.</p><Link href="/wedding">Back to workspace</Link></section> : <>
{(query.created==="1"||query.updated==="1"||query.statusUpdated==="1") && <p role="status" className="event-success">{query.statusUpdated==="1" ? "Task status updated." : query.created==="1" ? "Task created." : "Task updated."}</p>}
{wedding.state!=="active" && <p className="wedding-notice">This wedding is archived. Tasks are read-only.</p>}
<section className="workspace-panel task-hero"><div className="task-badges"><span className="task-badge">{taskPriorityLabels[task.priority]} priority</span><span className="task-badge">{taskStatusLabels[task.status]}</span></div><h1>{task.title}</h1>{wedding.state==="active" && <Link href={`/wedding/tasks/${task.id}/edit`} className="button button-secondary">Edit task</Link>}</section>
{wedding.state==="active" && <TaskForm key={task.id+":"+task.version+":"+wedding.timezone} weddingId={wedding.id} timezone={wedding.timezone} initial={task} choices={{members:[],events:[]}} statusOnly/>}
<section className="workspace-panel task-details"><dl><div><dt>Assignee</dt><dd>{task.assignee?.name ?? "Unassigned"}{task.assignee && !task.assignee.active ? " · Inactive" : ""}</dd></div><div><dt>Due date &amp; time</dt><dd><TaskDue task={task} timezone={wedding.timezone} now={new Date()}/><small>{wedding.timezone}</small></dd></div><div><dt>Related event</dt><dd>{task.event?.available ? <Link href={`/wedding/events/${task.eventId}`}>{task.event.name} →</Link> : task.event ? task.event.name+" · Unavailable" : "Whole wedding"}</dd></div><div><dt>Description</dt><dd>{task.description || "No description"}</dd></div></dl><p className="event-privacy">Only your wedding’s planning family can view this task.</p></section>
</>}</main></WorkspaceShell>;
}
