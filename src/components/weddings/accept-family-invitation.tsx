"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { ResendVerificationButton } from "./resend-verification-button";

const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const readToken = () =>
  new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
const readEmpty = () => "";
export function AcceptFamilyInvitation({ email }: { email?: string }) {
  const router = useRouter();
  const token = useSyncExternalStore(subscribe, readToken, readEmpty);
  const [storedPreview, setPreview] = useState<{
    token: string;
    title: string;
    role: string;
    alreadyJoined?: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [feedbackToken, setFeedbackToken] = useState("");
  const preview = storedPreview?.token === token ? storedPreview : null;
  const currentError = feedbackToken === token ? error : "";
  const currentCode = feedbackToken === token ? code : "";
  const locked = useRef(false);
  async function request(accept = false) {
    if (locked.current) return;
    const requestToken = readToken();
    // Read the live fragment too: a click can precede the hash subscription's render.
    if (
      !requestToken ||
      (accept && (!preview || preview.token !== requestToken))
    )
      return;
    locked.current = true;
    setPending(true);
    setError("");
    setCode("");
    setFeedbackToken(requestToken);
    try {
      const response = await fetch(
        `/api/v1/membership-invitations/${accept ? "accept" : "preview"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1" },
          body: JSON.stringify({ token: requestToken }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const result = await response.json();
      if (readToken() !== requestToken) return;
      router.refresh();
      if (!response.ok) {
        setPreview(null);
        setError(
          result.error?.message ??
            "Invitation services are unavailable. Please retry.",
        );
        setCode(result.error?.code ?? "");
        return;
      }
      if (accept) {
        window.history.replaceState(null, "", "/membership-invitation");
        router.replace("/wedding");
        router.refresh();
      } else setPreview({ ...result.data, token: requestToken });
    } catch {
      if (readToken() !== requestToken) return;
      setError(
        "Could not confirm the request. Retry to check your invitation.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <section className="wedding-card wedding-form invitation-accept-card">
      <h1>You’re invited to help plan</h1>
      <p>Check your invitation, then explicitly accept to join the wedding.</p>
      {!token ? (
        <p className="wedding-notice">
          Open the full invitation link from your email.
        </p>
      ) : (
        <>
          {preview && (
            <>
              <h2>{preview.title}</h2>
              <p>
                Invited role: <strong>{preview.role}</strong>
              </p>
              <p>
                {preview.role === "ADMIN"
                  ? "Can plan the wedding and manage family access."
                  : "Can help plan the wedding. Cannot manage family access."}
              </p>
              <p>
                Accepting joins this wedding. Your public page and gallery
                settings will not change.
              </p>
            </>
          )}
          {email && <p>Signed in as {email}</p>}
          {currentError && (
            <p className="wedding-error" role="alert">
              {currentError}
            </p>
          )}
          {currentCode === "UNAUTHENTICATED" && (
            <>
              <p>
                Sign in or create an account with the invited email in a new
                tab. Then return here and check again. Your invitation stays in
                this tab.
              </p>
              <div className="wedding-actions">
                <a href="/login" target="_blank" rel="noopener noreferrer">
                  Sign in
                </a>
                <a href="/register" target="_blank" rel="noopener noreferrer">
                  Create account
                </a>
              </div>
            </>
          )}
          {currentCode === "EMAIL_NOT_VERIFIED" && (
            <>
              <p>Verify the invited email, return here and check again.</p>
              {email && <ResendVerificationButton email={email} />}
            </>
          )}
          {["INVITATION_EMAIL_MISMATCH", "EMAIL_NOT_VERIFIED"].includes(
            currentCode,
          ) && (
            <LogoutButton
              onSignedOut={() => {
                setPreview(null);
                setFeedbackToken(readToken());
                setCode("UNAUTHENTICATED");
                setError(
                  "Sign in with the invited email, then check your invitation again.",
                );
              }}
            />
          )}
          <div className="wedding-actions">
            {preview?.alreadyJoined ? (
              <a className="button button-primary" href="/wedding">
                Open your wedding
              </a>
            ) : preview ? (
              <button
                className="button button-primary"
                disabled={pending}
                onClick={() => request(true)}
              >
                {pending ? "Joining wedding…" : "Accept invitation"}
              </button>
            ) : (
              <button
                className="button button-primary"
                disabled={pending}
                onClick={() => request()}
              >
                {pending ? "Checking invitation…" : "Check invitation"}
              </button>
            )}
            <a href="/account">Not now</a>
          </div>
        </>
      )}
    </section>
  );
}
