import { WorkspaceShell } from "@/components/weddings/workspace-shell";

export default function Loading() {
  return (
    <WorkspaceShell>
      <main
        className="wedding-overview wedding-loading"
        role="status"
        aria-busy="true"
      >
        <span className="sr-only">
          Opening your wedding. Loading your saved workspace.
        </span>
        <div aria-hidden="true">
          <div className="wedding-skeleton wedding-skeleton-kicker" />
          <div className="wedding-skeleton wedding-skeleton-title" />
          <div className="wedding-skeleton wedding-skeleton-subtitle" />
          <div className="wedding-skeleton wedding-skeleton-notice" />
          <div className="wedding-overview-grid">
            {[0, 1, 2].map((card) => (
              <div className="wedding-card" key={card}>
                <div className="wedding-skeleton wedding-skeleton-heading" />
                {[0, 1, 2].map((row) => (
                  <div className="wedding-skeleton-pair" key={row}>
                    <div className="wedding-skeleton wedding-skeleton-label" />
                    <div className="wedding-skeleton wedding-skeleton-value" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </WorkspaceShell>
  );
}
