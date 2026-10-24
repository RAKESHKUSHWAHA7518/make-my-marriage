"use client";
import Link from "next/link";
import { useTransition } from "react";
import { WorkspaceShell } from "@/components/weddings/workspace-shell";
import { WeddingIcon } from "@/components/weddings/wedding-icon";
export default function ErrorPage({ retry }: { retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <WorkspaceShell>
      <main className="wedding-overview">
        <section className="wedding-request-error wedding-card">
          <span className="wedding-state-icon">
            <WeddingIcon name="cloud" />
          </span>
          <h1>Unable to load wedding details</h1>
          <p role="alert">
            We couldn’t retrieve your workspace information due to a temporary
            issue. Your saved wedding details have not been changed.
          </p>
          <div className="wedding-error-actions">
            <button
              className="button button-primary"
              disabled={pending}
              onClick={() => startTransition(retry)}
            >
              <WeddingIcon name="retry" />
              {pending ? "Trying again…" : "Retry"}
            </button>
            <Link href="/account">
              <WeddingIcon name="back" />
              Back to account
            </Link>
          </div>
        </section>
      </main>
    </WorkspaceShell>
  );
}
