import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { listTasks, taskChoices, taskSummary } from "@/modules/tasks/service";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskRows, TaskCounts } from "@/components/tasks/task-display";
export const dynamic = "force-dynamic";
export const metadata = {title:"Tasks | Make My Marriage"};
export default async function TasksPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
 const {user,wedding}=await eventWorkspace(), raw=await searchParams;
 const query=Object.fromEntries(Object.entries(raw).filter((entry):entry is [string,string]=>typeof entry[1]==="string" && !!entry[1]));
 const [page,choices,summary]=await Promise.all([listTasks(user,wedding.id,query),taskChoices(user,wedding.id),taskSummary(user,wedding.id)]);
 const next=new URLSearchParams(query);if(page.pagination.nextCursor)next.set("cursor",page.pagination.nextCursor);
 const filtered=Object.keys(query).some(k=>k!=="cursor" && k!=="limit");
 return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="tasks"><main className="workspace-main tasks-page">
 <header className="event-page-heading"><div><h1>Tasks</h1><p>Keep your wedding plans moving, together.</p></div>{wedding.state==="active" && <Link className="button button-primary" href="/wedding/tasks/new">+ Create task</Link>}</header>
 {wedding.state!=="active" && <p className="wedding-notice">This wedding is archived. Tasks are read-only.</p>}
 <TaskCounts summary={summary}/><TaskFilters key={JSON.stringify(query)} query={query} choices={choices} timezone={wedding.timezone}/>
 {page.data.length ? <TaskRows tasks={page.data} timezone={wedding.timezone} now={new Date()}/> : <section className="workspace-panel event-empty"><h2>{filtered ? "No tasks match these filters" : "A little planning starts here"}</h2><p>{filtered ? "Try adjusting your filters." : "Create your first task and share the work with your planning family."}</p>{filtered ? <Link href="/wedding/tasks">Clear filters</Link> : wedding.state==="active" && <Link className="button button-primary" href="/wedding/tasks/new">Create task</Link>}</section>}
 {page.pagination.nextCursor && <Link className="button button-secondary" href={"/wedding/tasks?"+next.toString()}>Next page →</Link>}
 </main></WorkspaceShell>;
}
