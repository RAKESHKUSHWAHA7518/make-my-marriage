import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { Gallery } from "@/components/gallery/gallery";
import { listGallery } from "@/modules/media/service";
export const dynamic = "force-dynamic";
export const metadata = { title: "Family gallery | Make My Marriage" };
export default async function GalleryPage() {
  const { user, wedding } = await eventWorkspace();
  const initial = await listGallery(user);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="photos"><main className="workspace-main gallery-page"><Gallery initial={initial} weddingId={wedding.id} showPreview={process.env.NODE_ENV === "development"}/></main></WorkspaceShell>;
}
