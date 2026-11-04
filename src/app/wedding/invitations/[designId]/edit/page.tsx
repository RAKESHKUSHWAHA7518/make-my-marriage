import Link from "next/link";
import { notFound } from "next/navigation";
import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { designFor, designChoices, designsEnabled } from "@/modules/designs/service";
import { DesignEditor } from "@/components/designs/design-editor";
export const dynamic="force-dynamic";
export const metadata={title:"Edit invitation | Make My Marriage"};
export default async function EditDesignPage({params}:{params:Promise<{designId:string}>}) {
  const {user,wedding}=await eventWorkspace(), d=await designFor(user,wedding.id,(await params).designId); if(!d)notFound();
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="invitations"><main className="workspace-main designs-page"><Link className="wedding-back" href={`/wedding/invitations/${d.id}`}>← Back to saved draft</Link><header className="event-page-heading"><div><h1>{d.mode==="template"?"Personalize your invitation":"Upload your invitation"}</h1><p>Update your private draft. Nothing is published or sent.</p></div></header><DesignEditor key={d.id+":"+d.version} weddingId={wedding.id} initial={d} starting={{name:d.name,mode:d.mode,eventIds:d.eventIds,draft:d.draft}} choices={await designChoices(user,wedding.id)} enabled={await designsEnabled()} readOnly={wedding.state!=="active"}/></main></WorkspaceShell>;
}
