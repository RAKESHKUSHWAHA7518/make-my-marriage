import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, weddingFor } from "@/modules/weddings/service";
import { WorkspaceShell, WeddingGate } from "@/components/weddings/workspace-shell";
import { WorkspaceDashboard } from "@/components/weddings/workspace-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sample workspace | Make My Marriage" };

export default async function SampleWorkspacePage() {
  const user = await weddingUser();
  const membership = await membershipFor(user);
  if (!membership) redirect("/wedding/create");
  if (membership.status !== "active") return <WorkspaceShell name={user.displayName}><WeddingGate kind="removed" /></WorkspaceShell>;
  const wedding = await weddingFor(user);
  if (!wedding) redirect("/account");
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="sample">
    <main className="workspace-main">
      <aside className="workspace-sample-banner"><div><strong>Sample workspace · illustrative only</strong><p>All figures, names, events and tasks below are examples. Nothing here is saved to your wedding, and these planning features are not available yet.</p></div><Link href="/wedding" className="button button-secondary">Return to your wedding</Link></aside>
      <WorkspaceDashboard sample summary={{ title: "Rhea & Arjun’s Wedding", couple: "Rhea & Arjun", date: "14 February 2027", timezone: "Asia/Kolkata", currency: "INR", budget: "₹5,00,000", website: "Unpublished", gallery: "Not enabled", role: "MANAGER", archived: false }} />
    </main>
  </WorkspaceShell>;
}
