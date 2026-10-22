"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { announceSessionChange } from "./session-sync";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <button
        className="button button-primary"
        disabled={pending}
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
            router.replace("/login");
            router.refresh();
          } catch {
            setError("Could not sign out. Please try again.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      <p role="status">{error}</p>
    </div>
  );
}
