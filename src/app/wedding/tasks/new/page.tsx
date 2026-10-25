import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { tasksReady, taskChoices } from "@/modules/tasks/service";
import { TaskForm } from "@/components/tasks/task-form";
export const dynamic="force-dynamic";
export const metadata={title:"Create task | Make My Marriage"};
export default async function CreateTaskPage(){const {user,wedding}=await eventWorkspace();await tasksReady();const choices=await taskChoices(user,wedding.id);
return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="tasks"><main className="workspace-main tasks-page"><Link className="wedding-back" href="/wedding/tasks">← Back to tasks</Link><header className="event-page-heading"><div><h1>Create task</h1><p>Add something your planning family needs to do.</p></div></header>{wedding.state!=="active" ? <p className="wedding-notice">This wedding is archived. Tasks are read-only.</p> : <TaskForm weddingId={wedding.id} timezone={wedding.timezone} choices={choices}/>}</main></WorkspaceShell>;
}
