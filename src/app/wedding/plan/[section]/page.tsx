import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, weddingFor } from "@/modules/weddings/service";
import { WorkspaceShell, WeddingGate } from "@/components/weddings/workspace-shell";
import { workspaceSections } from "@/components/weddings/workspace-sections";
import { WeddingIcon } from "@/components/weddings/wedding-icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planning workspace | Make My Marriage" };

export default async function PlannedWorkspacePage({ params }: { params: Promise<{ section: string; }>; }) {
  const { section } = await params;
  if (section === "photos") redirect("/wedding/gallery");
  if (section === "guests") redirect("/wedding/guests");
  if (section === "tasks") redirect("/wedding/tasks");
  if (section === "events") redirect("/wedding/events");
  const item = workspaceSections.find((entry) => entry.key === section && entry.planned);
  if (!item) notFound();
  const user = await weddingUser();
  const membership = await membershipFor(user);
  if (!membership) redirect("/wedding/create");
  if (membership.status !== "active") return <WorkspaceShell name={user.displayName}><WeddingGate kind="removed" /></WorkspaceShell>;
  const wedding = await weddingFor(user);
  if (!wedding) redirect("/account");
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage={item.key}>
    <main className="workspace-main">
      <div className="workspace-page-heading"><span className="wedding-kicker">Your V1 planning space</span><h1>{item.label}</h1><p>{item.description}</p></div>
      <section className="workspace-panel workspace-coming-soon">
        <span className="workspace-large-icon"><WeddingIcon name={item.icon} /></span>
        <span className="workspace-availability">Coming soon</span>
        <h2>A home for {item.label.toLowerCase()}</h2>
        <p>This section is part of the V1 plan. It is not available yet, and no {item.key === "settings" ? "additional settings" : item.label.toLowerCase()} can be created or changed here.</p>
        {item.key === "invitations" && <p>Inviting your partner or family to help plan? Family invitations already work in <Link href="/wedding/family">Family &amp; access</Link>. Guest invitations will follow separately.</p>}
        {item.key === "settings" && <p>Saved wedding details are available now. <Link href="/wedding/details">{wedding.role === "ADMIN" && wedding.state === "active" ? "Edit wedding details" : "View wedding details"}</Link>.</p>}
        <div className="workspace-coming-actions"><Link className="button button-primary" href="/wedding">Back to overview</Link><Link className="button button-secondary" href="/wedding/sample">View sample workspace</Link></div>
      </section>
      {wedding.state === "archived" && <p className="wedding-notice">Your wedding is archived and remains read-only.</p>}
    </main>
  </WorkspaceShell>;
}
