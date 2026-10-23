"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WeddingDialog } from "./wedding-dialog";
import { WeddingIcon } from "./wedding-icon";

export function InviteFamilyForm({ weddingId }: { weddingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    locked.current = true;
    setPending(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/weddings/${weddingId}/member-invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1" },
          body: JSON.stringify({
            email: String(values.get("email") ?? "").trim(),
            role: values.get("role"),
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const result = await response.json();
      setFailed(!response.ok);
      setNotice(
        response.ok
          ? "Invitation created. Email is queued; delivery is not yet confirmed. They must accept before gaining access."
          : (result.error?.message ??
              "Could not create the invitation. Check the invitation list before retrying."),
      );
      if (response.ok) form.reset();
      router.refresh();
    } catch {
      setFailed(true);
      setNotice(
        "We could not confirm the request. Your entries are preserved. Check the invitation list before retrying to avoid a duplicate.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <WeddingDialog
      title="Invite someone to your wedding"
      trigger="Invite someone"
      busy={pending}
      primary
    >
      {(close) => (
        <form
          className="wedding-form invitation-compose"
          onSubmit={submit}
          aria-busy={pending}
        >
          <p className="wedding-dialog-description">
            Send an invitation to collaborate on your wedding workspace.
          </p>
          <fieldset disabled={pending} className="wedding-fields">
            <div className="wedding-grid">
              <label className="wedding-wide">
                Email address <span>*</span>
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="e.g. partner@example.com"
                />
              </label>
              <fieldset className="wedding-wide invitation-role-options">
                <legend>
                  Select role permission <span>*</span>
                </legend>
                <label className="invitation-role-card">
                  <input
                    type="radio"
                    name="role"
                    value="MANAGER"
                    defaultChecked
                  />
                  <WeddingIcon name="person" />
                  <strong>Manager</strong>
                  <small>
                    Can help plan the wedding. Wedding details are view-only; cannot manage family access.
                  </small>
                  <span className="invitation-recommended">Recommended</span>
                </label>
                <label className="invitation-role-card">
                  <input type="radio" name="role" value="ADMIN" />
                  <WeddingIcon name="shield" />
                  <strong>Admin</strong>
                  <small>Can plan the wedding and manage family access.</small>
                </label>
              </fieldset>
            </div>
          </fieldset>
          <p className="wedding-notice invitation-partner-note">
            <WeddingIcon name="heart" />
            Inviting your partner? Choose ADMIN if they should also manage
            family access.
          </p>
          <p>
            They’ll need to sign in with this email, verify it and accept the
            invitation.
          </p>
          <div className="wedding-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </button>
            <button className="button button-primary" disabled={pending}>
              {pending ? "Sending invitation…" : "Send invitation"}
            </button>
          </div>
          {notice && (
            <p
              role={failed ? "alert" : "status"}
              className={failed ? "wedding-error" : "wedding-notice"}
            >
              {notice}{" "}
              {failed && (
                <a href="#family-invitations-heading">View invitations</a>
              )}
            </p>
          )}
        </form>
      )}
    </WeddingDialog>
  );
}

export function RevokeInvitationButton({
  weddingId,
  inviteId,
  version,
}: {
  weddingId: string;
  inviteId: string;
  version: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function revoke() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/weddings/${weddingId}/member-invitations/${inviteId}/revoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1" },
          body: JSON.stringify({ expectedVersion: version }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const result = await response.json();
      if (!response.ok)
        setError(result.error?.message ?? "Could not revoke this invitation.");
      router.refresh();
      return response.ok;
    } catch {
      setError(
        "Could not confirm revocation. Reload invitations to check before retrying.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <WeddingDialog
      title="Revoke this invitation?"
      trigger="Revoke invitation"
      busy={pending}
    >
      {(close) => (
        <>
          <p className="wedding-dialog-description">
            This invitation link will no longer allow this person to join.
          </p>
          {error && (
            <p role="alert" className="wedding-error">
              {error}
            </p>
          )}
          <div className="wedding-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={pending}
              onClick={async () => {
                if (await revoke()) close();
              }}
            >
              {pending ? "Revoking…" : "Revoke invitation"}
            </button>
          </div>
        </>
      )}
    </WeddingDialog>
  );
}
