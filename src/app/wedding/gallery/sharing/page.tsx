import { eventWorkspace } from "@/modules/events/page-session";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { GallerySharing } from "@/components/gallery/gallery-sharing";
import { gallerySettings } from "@/modules/media/gallery-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery sharing | Make My Marriage", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page() {
  const { user, wedding } = await eventWorkspace();
  const initial = await gallerySettings(user, wedding.id);
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="photos"><main className="workspace-main gallery-page"><GallerySharing initial={initial} weddingId={wedding.id} role={wedding.role}/></main></WorkspaceShell>;
}
