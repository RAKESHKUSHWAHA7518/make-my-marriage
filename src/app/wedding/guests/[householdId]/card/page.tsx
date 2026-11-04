import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { publicationEnabled, householdCardChoices } from "@/modules/designs/publication";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { CardSelection } from "@/components/designs/card-selection";
export const dynamic = "force-dynamic";
export const metadata = { title: "Choose invitation card | Make My Marriage" };
export default async function HouseholdCardPage({ params, searchParams }: { params: Promise<{ householdId: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { user, wedding } = await eventWorkspace(), { householdId } = await params, query = await searchParams, enabled = await publicationEnabled();
  const choices = enabled ? await householdCardChoices(user, wedding.id, householdId, query.cursor) : null;
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="guests"><main className="workspace-main designs-page"><Link className="wedding-back" href={`/wedding/guests/${householdId}`}>← Back to household</Link><header className="event-page-heading"><div><h1>Choose invitation card</h1><p>{choices?.householdName}</p></div></header>{!choices ? <p className="wedding-notice">Invitation card selection is awaiting activation.</p> : <>{wedding.state !== "active" && <p className="wedding-notice">This wedding is archived. Card selection is read-only.</p>}<CardSelection key={`${choices.version}:${query.cursor ?? ""}`} weddingId={wedding.id} householdId={householdId} version={choices.version} selectedId={choices.selectedId} choices={choices.data} readOnly={wedding.state !== "active"} />{choices.nextCursor && <Link className="button button-secondary" href={`?cursor=${encodeURIComponent(choices.nextCursor)}`}>More published cards</Link>}{query.cursor && <Link className="button button-secondary" href={`/wedding/guests/${householdId}/card`}>Newest cards</Link>}</>}</main></WorkspaceShell>;
}
