export default function EventsLoading() {
  return <main className="workspace-main" role="status" aria-busy="true"><span className="sr-only">Loading your celebrations…</span><div aria-hidden="true"><div className="wedding-skeleton wedding-skeleton-title" />{[0, 1, 2].map((i) => <div key={i} className="event-skeleton wedding-skeleton" />)}</div></main>;
}
