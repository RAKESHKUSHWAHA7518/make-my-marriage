"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function WeddingDialog({
  title,
  trigger,
  children,
  busy = false,
  disabled = false,
  primary = false,
}: {
  title: string;
  trigger: string;
  children: (close: () => void) => ReactNode;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const close = () => {
    if (!busy) setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={`button ${primary ? "button-primary" : "button-secondary"}`}
        disabled={disabled || busy}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </button>
      <dialog
        ref={dialog}
        className="wedding-dialog wedding-card"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <header className="wedding-dialog-heading">
          <div>
            <span className="wedding-kicker">Family &amp; access</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="wedding-dialog-close"
            aria-label="Close dialog"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </header>
        {children(close)}
      </dialog>
    </>
  );
}
