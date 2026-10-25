"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const channelName = "mmm-session-change";
type SessionChange = { id: string; kind: "signed-in" | "signed-out" };

// Share only an invalidation signal, never a cookie, token or user identity.
export function announceSessionChange(kind: SessionChange["kind"]) {
  const message: SessionChange = { id: crypto.randomUUID(), kind };
  try {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage(message);
    channel.close();
  } catch {
    /* Storage events and focus revalidation cover unsupported browsers. */
  }
  try {
    localStorage.setItem(channelName, JSON.stringify(message));
  } catch {
    /* Private browsing may block storage. */
  }
}

export function SessionSync() {
  const pathname = usePathname();
  useEffect(() => {
    const entry = pathname === "/login" || pathname === "/register";
    const protectedPage =
      pathname === "/account" ||
      pathname === "/wedding" ||
      pathname.startsWith("/wedding/");
    if (!entry && !protectedPage) return;
    let disposed = false;
    let pending = false;
    let lastMessage = "";
    const controller = new AbortController();
    const check = async () => {
      if (pending || disposed) return;
      pending = true;
      try {
        const response = await fetch("/api/v1/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (disposed) return;
        if (response.status === 401 && protectedPage)
          window.location.replace("/login");
        else if (response.ok && entry) window.location.replace("/wedding");
      } catch {
        /* A network error is not proof of logout. */
      } finally {
        pending = false;
      }
    };
    const changed = (message: SessionChange) => {
      if (
        !message ||
        typeof message.id !== "string" ||
        message.id === lastMessage
      )
        return;
      if (message.kind !== "signed-in" && message.kind !== "signed-out") return;
      lastMessage = message.id;
      // A full navigation clears cached private markup and rechecks the server cookie.
      if (protectedPage)
        window.location.replace(
          message.kind === "signed-out" ? "/login" : "/wedding",
        );
      else void check();
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== channelName || !event.newValue) return;
      try {
        changed(JSON.parse(event.newValue));
      } catch {
        /* Ignore unrelated invalid data. */
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event) => changed(event.data);
    } catch {
      /* Storage events remain available. */
    }
    window.addEventListener("storage", storage);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", visible);
    void check();
    return () => {
      disposed = true;
      controller.abort();
      channel?.close();
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [pathname]);
  return null;
}
