import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { taskFor, taskChoices } from "@/modules/tasks/service";
import { TaskForm } from "@/components/tasks/task-form";
export const dynamic="force-dynamic";
export const metadata={title:"Edit task | Make My Marriage"};
export default async function EditTaskPage({params}:{params:Promise<{taskId:string}>}){const {user,wedding}=await eventWorkspace();const task=await taskFor(user,wedding.id,(await params).taskId);const choices=task ? await taskChoices(user,wedding.id) : {members:[],events:[]};
return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="tasks"><main className="workspace-main tasks-page"><Link className="wedding-back" href={task ? `/wedding/tasks/${task.id}` : "/wedding"}>← {task ? "Back to task details" : "Back to workspace"}</Link><header className="event-page-heading"><div><h1>Edit task</h1><p>Update the details and keep everyone on the same page.</p></div></header>{!task ? <p>This task is unavailable, or you no longer have permission to view it.</p> : wedding.state!=="active" ? <p className="wedding-notice">This wedding is archived. Tasks are read-only.</p> : <TaskForm key={task.id+":"+task.version+":"+wedding.timezone} weddingId={wedding.id} timezone={wedding.timezone} choices={choices} initial={task}/>}</main></WorkspaceShell>;
}
