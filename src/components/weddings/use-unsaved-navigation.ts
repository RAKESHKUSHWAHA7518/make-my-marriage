"use client";
import { useEffect, type RefObject } from "react";
export function useUnsavedNavigation({ dirty, pending, leaving, destination, reloadRequested, dialog }: { dirty: boolean; pending: boolean; leaving: RefObject<boolean>; destination: RefObject<string>; reloadRequested: RefObject<boolean>; dialog: RefObject<HTMLDialogElement | null> }) {
  useEffect(() => {
    if (!dirty && !pending) return;
    const unload = (event: BeforeUnloadEvent) => { if (!leaving.current) event.preventDefault(); };
    const leave = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      event.preventDefault(); event.stopPropagation();
      if (pending) return;
      // Only follow same-origin application destinations from this confirmation.
      if (url.origin !== location.origin) return;
      reloadRequested.current = false;
      destination.current = url.pathname + url.search + url.hash;
      dialog.current?.showModal();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", leave, true); };
  }, [dirty, pending, destination, dialog, leaving, reloadRequested]);
}
