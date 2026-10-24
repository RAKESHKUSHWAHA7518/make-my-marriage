import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/auth/logout-button";
import { WeddingIcon } from "./wedding-icon";
import { ResendVerificationButton } from "./resend-verification-button";

export function WorkspaceShell({
  name,
  children,
  role,
  weddingTitle,
  activePage,
}: {
  name?: string;
  role?: "ADMIN" | "MANAGER";
  weddingTitle?: string;
  activePage?: "overview" | "details" | "family";
  children: ReactNode;
}) {
  return (
    <div className="wedding-shell">
      <header className="wedding-header">
        <Brand />
        {weddingTitle && (
          <>
            <div className="wedding-header-title">
              <small>Wedding workspace</small>
              <strong>{weddingTitle}</strong>
            </div>
            <nav className="wedding-header-nav" aria-label="Wedding workspace">
              <Link
                href="/wedding"
                aria-current={activePage === "overview" ? "page" : undefined}
              >
                Overview
              </Link>
              <Link
                href="/wedding/details"
                aria-current={activePage === "details" ? "page" : undefined}
              >
                Wedding details
              </Link>
              <Link
                href="/wedding/family"
                aria-current={activePage === "family" ? "page" : undefined}
              >
                Family &amp; access
              </Link>
            </nav>
          </>
        )}
        <div className="wedding-account">
          {name && (
            <details>
              <summary aria-label={`Account menu for ${name}`}>
                <span className="wedding-avatar">
                  <WeddingIcon name="person" />
                </span>
                <span className="wedding-account-name">
                  {name}
                  {role && (
                    <small>{role === "ADMIN" ? "Admin" : "Manager"}</small>
                  )}
                </span>
              </summary>
              <Link href="/account">Your account</Link>
            </details>
          )}
          <LogoutButton />
        </div>
      </header>
      {children}
      <footer className="wedding-footer">
        © {new Date().getFullYear()} Make My Marriage
      </footer>
    </div>
  );
}

export function WeddingGate({
  kind,
  email,
  title,
}: {
  kind: "unverified" | "removed" | "existing";
  email?: string;
  title?: string;
}) {
  return (
    <main className={`wedding-gate wedding-card wedding-gate-${kind}`}>
      <div className="wedding-gate-topline">
        <span className="wedding-kicker">Your wedding workspace</span>
        <span className="wedding-gate-status">
          <i />
          {kind === "unverified"
            ? "Action required"
            : kind === "existing"
              ? "Active space found"
              : "Access unavailable"}
        </span>
      </div>
      <span className="wedding-state-icon">
        <WeddingIcon
          name={
            kind === "unverified"
              ? "mail"
              : kind === "existing"
                ? "heart"
                : "lock"
          }
        />
      </span>
      <h1>
        {kind === "unverified"
          ? "Please verify your email"
          : kind === "removed"
            ? "Wedding access unavailable"
            : "You already have a wedding"}
      </h1>
      <div className="wedding-gate-image">
        <Image
          src={`/images/onboarding-${kind === "unverified" ? "verification" : kind === "existing" ? "existing" : "access"}.jpg`}
          alt=""
          loading="eager"
          sizes="(max-width: 600px) calc(100vw - 90px), 450px"
          width={700}
          height={300}
        />
      </div>
      <p>
        {kind === "unverified"
          ? "Verify your email before creating a wedding workspace. Check your inbox for your verification link."
          : kind === "removed"
            ? "You no longer have access to this wedding. Contact a wedding administrator. Your account remains associated with this wedding."
            : "Each account belongs to one wedding. You can open your saved wedding below."}
      </p>
      {kind === "unverified" && email && (
        <p className="wedding-gate-email">{email}</p>
      )}
      {kind === "existing" && title && (
        <div className="wedding-saved-title">
          <WeddingIcon name="heart" />
          <div>
            <strong>{title}</strong>
            <small>Your saved wedding workspace</small>
          </div>
        </div>
      )}
      {kind === "unverified" && email ? (
        <ResendVerificationButton email={email} />
      ) : kind === "unverified" ? (
        <Link className="button button-primary" href="/verify-email">
          Resend verification
        </Link>
      ) : kind === "existing" ? (
        <Link className="button button-primary" href="/wedding">
          Open your wedding →
        </Link>
      ) : (
        <Link className="button" href="/account">
          Back to account
        </Link>
      )}
      {kind === "existing" && (
        <small className="wedding-gate-footnote">One wedding per account</small>
      )}
      {kind !== "existing" && (
        <div className="wedding-gate-signout">
          <LogoutButton />
        </div>
      )}
    </main>
  );
}
