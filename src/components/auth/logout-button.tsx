"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { announceSessionChange } from "./session-sync";

export function LogoutButton({
  onSignedOut,
}: { onSignedOut?: () => void } = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="logout-control">
      <button
        className="button button-primary"
        disabled={pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const response = await fetch("/api/v1/auth/logout", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-MMM-CSRF": "1",
              },
              body: "{}",
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error();
            announceSessionChange("signed-out");
            if (onSignedOut) onSignedOut();
            else router.replace("/login");
            router.refresh();
          } catch {
            setError("Could not sign out. Please try again.");
          } finally {
            setPending(false);
          }
        }}
      >
        <span className="logout-label">
          <span
            aria-hidden={pending}
            style={{ visibility: pending ? "hidden" : "visible" }}
          >
            Sign out
          </span>
          <span
            aria-hidden={!pending}
            style={{ visibility: pending ? "visible" : "hidden" }}
          >
            Signing out…
          </span>
        </span>
      </button>
      {error && (
        <p className="logout-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
