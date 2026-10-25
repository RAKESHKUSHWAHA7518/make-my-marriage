"use client";

import { useRef } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { WeddingIcon } from "./wedding-icon";
import { workspaceSections } from "./workspace-sections";

function WorkspaceLinks({ activePage, onNavigate }: {
  activePage?: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Wedding workspace">
      {workspaceSections.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          onClick={onNavigate}
          aria-current={activePage === item.key ? "page" : undefined}
        >
          <WeddingIcon name={item.icon} />
          <span>{item.label}</span>
          {item.planned && <small>Soon</small>}
        </Link>
      ))}
    </nav>
  );
}

export function WorkspaceNavigation({ activePage }: { activePage?: string }) {
  const drawer = useRef<HTMLDialogElement>(null);
  return (
    <>
      <aside className="workspace-sidebar">
        <Brand />
        <p className="workspace-nav-caption">Your planning space</p>
        <WorkspaceLinks activePage={activePage} />
        <div className="workspace-sidebar-foot">
          <WeddingIcon name="heart" />
          <p>A little more together.<br /><span>One celebration, one shared space.</span></p>
        </div>
      </aside>
      <div className="workspace-mobile-nav">
        <Link href="/wedding" aria-current={activePage === "overview" ? "page" : undefined}>
          <WeddingIcon name="dashboard" /><span>Overview</span>
        </Link>
        <Link href="/wedding/plan/events" aria-current={activePage === "events" ? "page" : undefined}>
          <WeddingIcon name="calendar" /><span>Events</span>
        </Link>
        <Link href="/wedding/family" aria-current={activePage === "family" ? "page" : undefined}>
          <WeddingIcon name="people" /><span>Family</span>
        </Link>
        <button type="button" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}>
          <WeddingIcon name="menu" /><span>More</span>
        </button>
      </div>
      <dialog ref={drawer} className="workspace-drawer" aria-labelledby="workspace-menu-title">
        <header><h2 id="workspace-menu-title">Your workspace</h2>
          <button type="button" className="wedding-dialog-close" aria-label="Close workspace menu"
            onClick={() => drawer.current?.close()}>×</button>
        </header>
        <WorkspaceLinks activePage={activePage} onNavigate={() => drawer.current?.close()} />
        <Link className="workspace-drawer-account" href="/account" onClick={() => drawer.current?.close()}>
          <WeddingIcon name="person" /> Your account
        </Link>
      </dialog>
    </>
  );
}
