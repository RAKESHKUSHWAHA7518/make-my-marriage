import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { GalleryPreview } from "@/components/gallery/gallery-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Family gallery preview | Make My Marriage" };
export default async function GalleryPage() {
  const { user, wedding } = await eventWorkspace();
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="photos"><main className="workspace-main gallery-page"><GalleryPreview archived={wedding.state !== "active"}/></main></WorkspaceShell>;
}
