import Link from "next/link";
import type { RsvpTotals } from "@/modules/households/service";
import { responseLabels } from "@/modules/guest-access/schema";
import { TaskRetry } from "@/components/tasks/task-retry";
export function RsvpSummary({ totals }: { totals: RsvpTotals | null }) {
  return <section className="workspace-panel rsvp-summary"><div className="workspace-panel-heading"><h2>Household responses</h2><Link href="/wedding/guests">View guest groups →</Link></div>{!totals ? <><p>RSVP information is temporarily unavailable.</p><TaskRetry /></> : <><div className="rsvp-summary-counts">{Object.entries(totals.counts).map(([status, count]) => <Link href={`/wedding/guests?rsvpStatus=${status}`} key={status}><span>{responseLabels[status as keyof typeof responseLabels]}</span><strong>{count}</strong></Link>)}</div><p><strong>{totals.attendingPeople}</strong> attending people · Counted once per active household with an eligible invitation.</p><small>Responses update on navigation or refresh. The same person entered in different households cannot be deduplicated.</small></>}</section>;
}
