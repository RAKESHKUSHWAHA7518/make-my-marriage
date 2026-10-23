"use client";
import { useRef, useState } from "react";
import { WeddingIcon } from "./wedding-icon";

export function ResendVerificationButton({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  return (
    <div className="wedding-resend">
      <button
        className="button button-primary"
        disabled={pending}
        onClick={async () => {
          if (locked.current) return;
          locked.current = true;
          setPending(true);
          setMessage("");
          setFailed(false);
          try {
            const response = await fetch("/api/v1/auth/resend-verification", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-MMM-CSRF": "1",
              },
              body: JSON.stringify({ email }),
              signal: AbortSignal.timeout(15000),
            });
            const result = await response.json();
            if (!response.ok) {
              setFailed(true);
              setMessage(
                result.error?.message ??
                  "Unable to request verification. Please try again.",
              );
            } else
              setMessage(
                result.data?.message ??
                  "If this address is eligible, you will receive an email with the next steps.",
              );
          } catch {
            setFailed(true);
            setMessage(
              "We could not confirm the request. Please check your inbox before trying again.",
            );
          } finally {
            locked.current = false;
            setPending(false);
          }
        }}
      >
        {pending ? (
          <span className="wedding-spinner" />
        ) : (
          <WeddingIcon name="mail" />
        )}
        {pending ? "Requesting verification…" : "Resend verification email"}
      </button>
      {message && (
        <p
          className={failed ? "wedding-resend-error" : "wedding-resend-message"}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </div>
  );
}
