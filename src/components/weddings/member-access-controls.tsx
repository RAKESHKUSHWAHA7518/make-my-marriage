"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WeddingDialog } from "./wedding-dialog";

export function MemberAccessControls({
  weddingId,
  memberId,
  name,
  role,
  version,
  archived,
  lastAdmin,
  self,
}: {
  weddingId: string;
  memberId: string;
  name: string;
  role: "ADMIN" | "MANAGER";
  version: number;
  archived: boolean;
  lastAdmin: boolean;
  self: boolean;
}) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState(role);
  const [pending, setPending] = useState<"role" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(false);
  const [notice, setNotice] = useState("");
  const locked = useRef(false);
  async function save(
    action: "role" | "remove",
    event?: FormEvent<HTMLFormElement>,
  ) {
    event?.preventDefault();
    if (locked.current || reload) return;
    locked.current = true;
    setPending(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/weddings/${weddingId}/members/${memberId}${action === "remove" ? "/remove" : ""}`,
        {
          method: action === "remove" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1" },
          body: JSON.stringify({
            expectedVersion: version,
            ...(action === "role" ? { role: selectedRole } : {}),
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Could not update access.");
        setReload(
          [
            "VERSION_CONFLICT",
            "LAST_ADMIN",
            "MEMBER_REMOVED",
            "WEDDING_ARCHIVED",
            "FORBIDDEN",
            "NOT_FOUND",
          ].includes(result.error?.code),
        );
        return;
      }
      if (self && action === "remove") {
        router.replace("/account");
        router.refresh();
        return true;
      }
      setNotice(
        action === "remove" ? "Wedding access removed." : "Role updated.",
      );
      router.refresh();
      return true;
    } catch {
      setError(
        "Could not confirm the update. Reload members to check the saved state before trying again.",
      );
      setReload(true);
    } finally {
      locked.current = false;
      setPending(null);
    }
  }
  const feedback = (
    <>
      {error && (
        <p role="alert" className="wedding-error">
          {error}
        </p>
      )}
      {reload && (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setReload(false);
            setError("");
            router.refresh();
          }}
        >
          Reload members
        </button>
      )}
    </>
  );
  const protection = lastAdmin && (
    <p className="wedding-notice">
      This wedding needs at least one administrator. Make another member an
      administrator before changing this role or removing access.
    </p>
  );
  return (
    <div className="member-access-controls">
      {!archived && (
        <WeddingDialog
          title="Change role"
          trigger="Change role"
          busy={!!pending}
        >
          {(close) => (
            <form
              className="wedding-form"
              onSubmit={async (event) => {
                if (await save("role", event)) close();
              }}
            >
              <p className="wedding-dialog-description">
                Update planning access for {name}.
              </p>
              {protection}
              <label>
                Assigned role
                <select
                  value={selectedRole}
                  disabled={!!pending || reload}
                  onChange={(event) =>
                    setSelectedRole(event.target.value as "ADMIN" | "MANAGER")
                  }
                >
                  <option value="ADMIN">
                    ADMIN — plan and manage family access
                  </option>
                  <option value="MANAGER" disabled={lastAdmin}>
                    MANAGER — plan without managing access
                  </option>
                </select>
              </label>
              {self && selectedRole === "MANAGER" && (
                <p className="wedding-notice">
                  You will no longer be able to manage family access.
                </p>
              )}
              {feedback}
              <div className="wedding-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!!pending}
                  onClick={() => {
                    setSelectedRole(role);
                    close();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={
                    !!pending ||
                    reload ||
                    selectedRole === role ||
                    (lastAdmin && selectedRole === "MANAGER")
                  }
                >
                  {pending === "role" ? "Saving role…" : "Save role"}
                </button>
              </div>
            </form>
          )}
        </WeddingDialog>
      )}
      <WeddingDialog
        title="Remove wedding access?"
        trigger="Remove access"
        disabled={lastAdmin}
        busy={!!pending}
      >
        {(close) => (
          <>
            <p className="wedding-dialog-description">
              {name} will no longer be able to access this wedding. Their
              previous contributions and account will remain.
            </p>
            {protection}
            {feedback}
            <div className="wedding-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={!!pending}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!!pending || reload || lastAdmin}
                onClick={async () => {
                  if (await save("remove")) close();
                }}
              >
                {pending === "remove" ? "Removing access…" : "Remove access"}
              </button>
            </div>
          </>
        )}
      </WeddingDialog>
      {lastAdmin && (
        <small className="member-protected-label">
          Last administrator protected
        </small>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
