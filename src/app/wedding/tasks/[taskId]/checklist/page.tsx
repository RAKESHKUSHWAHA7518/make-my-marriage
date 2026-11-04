import Link from "next/link";
import { notFound } from "next/navigation";
import { eventWorkspace } from "@/modules/events/page-session";
import { taskFor, taskChecklistsEnabled } from "@/modules/tasks/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { TaskChecklist } from "@/components/tasks/task-checklist";
export const dynamic = "force-dynamic";
export const metadata = { title: "Edit checklist | Make My Marriage", robots: { index: false, follow: false } };
export default async function ChecklistPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { user, wedding } = await eventWorkspace(), task = await taskFor(user, wedding.id, (await params).taskId); if (!task) notFound();
  const enabled = await taskChecklistsEnabled();
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="tasks"><main className="workspace-main tasks-page"><Link className="wedding-back" href={`/wedding/tasks/${task.id}`}>← Back to task</Link><header className="event-page-heading"><div><span className="wedding-kicker">Task: {task.title}</span><h1>Edit checklist</h1><p>Update items or add new ones. Changes take effect after saving.</p></div></header><TaskChecklist key={task.id + ":" + task.version} task={task} weddingId={wedding.id} enabled={enabled} readOnly={wedding.state !== "active"} edit={wedding.state === "active"} /></main></WorkspaceShell>;
}
