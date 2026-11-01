import { notFound } from "next/navigation";
import { publicWebsite } from "@/modules/website/publication";
import { AccountError } from "@/modules/identity/security";
import { WeddingCelebration } from "@/components/website/public-website";
import { PublicCover } from "@/components/website/public-cover";
import { Brand } from "@/components/brand";
export const dynamic = "force-dynamic";
export const metadata = { title: "Wedding celebration | Make My Marriage", description: "A wedding celebration.", robots: { index: false, follow: false, noarchive: true } };
export default async function PublicWedding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let content;
  try { content = await publicWebsite(slug); } catch (error) { if (error instanceof AccountError && error.status === 404) notFound(); throw error; }
  return <main className="public-wedding"><nav className="public-wedding-nav" aria-label="Wedding website"><Brand /><div>{content.intro && <a href="#welcome">Welcome</a>}{!!content.events.length && <a href="#celebrations">Celebrations</a>}{content.contact && <a href="#contact">Contact</a>}</div></nav><WeddingCelebration content={content} cover={content.coverAssetId ? <PublicCover slug={slug} assetId={content.coverAssetId} /> : undefined} /></main>;
}
