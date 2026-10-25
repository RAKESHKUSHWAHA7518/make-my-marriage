export default function LoadingEditEvent() {
  return <main className="workspace-main events-page" aria-busy="true" aria-label="Loading event details">
    <h1>Loading event details…</h1>
    {["Event information", "Date & time", "Venue", "Additional details"].map((section) => <section className="workspace-panel" key={section}><h2>{section}</h2><p>Loading saved details…</p></section>)}
  </main>;
}
