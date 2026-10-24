"use client";

import { useRef, useState } from "react";
import { Brand } from "@/components/brand";
import Link from "next/link";

const links = [
  ["Features", "features"],
  ["How it works", "how-it-works"],
  ["Wedding websites", "websites"],
  ["FAQs", "faqs"],
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="shell header-inner">
        <Brand />
        <button
          ref={toggle}
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close ✕" : "Menu ☰"}
        </button>
        <nav
          id="main-navigation"
          aria-label="Main navigation"
          className={open ? "navigation is-open" : "navigation"}
        >
          {links.map(([label, id]) => (
            <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <Link href="/login" className="login-button">
            Log in
          </Link>
          <Link href="/register" className="button button-primary">
            Create your wedding <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
