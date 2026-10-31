import { Brand } from "@/components/brand";
import { GuestGallery } from "@/components/gallery/guest-gallery";
export const dynamic = "force-dynamic";
export const metadata = { title: "Wedding gallery | Make My Marriage", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const audience = (await searchParams).from === "invitation" ? "household" : "guest";
  return <div className="guest-invitation"><header className="invitation-header"><Brand/></header><main className="guest-gallery-main gallery-page"><GuestGallery key={audience} audience={audience}/></main><footer className="invitation-footer">Make My Marriage · Shared wedding gallery</footer></div>;
}
