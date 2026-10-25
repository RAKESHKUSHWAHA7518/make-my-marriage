import type { Metadata } from "next";
import Link from "next/link";
import { eventWorkspace } from "@/modules/events/page-session";
import { eventsReady } from "@/modules/events/service";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { EventForm } from "@/components/weddings/event-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create an event | Make My Marriage" };
export default async function CreateEventPage() {
  const { user, wedding } = await eventWorkspace();
  await eventsReady();
  return <WorkspaceShell name={user.displayName} role={wedding.role} weddingTitle={wedding.title} activePage="events">
    <main className="workspace-main events-page event-create-page">
      <Link className="wedding-back" href="/wedding/events">← Back to events</Link>
      <div className="event-page-heading"><div><h1>Create an event</h1><p>Start with the essentials. Your event will be saved as a private draft.</p></div><span className="event-status">Draft · Private</span></div>
      {wedding.state === "archived" ? <section className="workspace-panel"><h2>This wedding is archived</h2><p>Events remain viewable. New events cannot be created.</p><Link href="/wedding/events" className="workspace-text-link">Back to events</Link></section> : <EventForm weddingId={wedding.id} timezone={wedding.timezone} />}
    </main>
  </WorkspaceShell>;
}
