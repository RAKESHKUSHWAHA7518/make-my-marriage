"use client";

import { useRef, type ReactNode } from "react";

export function AccountButton({
  children,
  className = "button button-primary",
}: {
  children: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className={className} onClick={() => dialog.current?.showModal()}>
        {children}
      </button>
      <dialog
        ref={dialog}
        className="account-dialog"
        aria-label="Account access coming soon"
      >
        <p className="eyebrow">A little more time, a lot to look forward to</p>
        <h2>Your shared story starts here.</h2>
        <p>
          We’re getting Make My Marriage ready for you. Registration and login
          aren’t available yet. For now, explore a preview of what’s coming.
        </p>
        <form method="dialog">
          <button className="button button-primary" autoFocus>
            Back to exploring
          </button>
        </form>
      </dialog>
    </>
  );
}
