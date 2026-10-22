import Link from "next/link";
import { Brand } from "@/components/brand";
import "./auth.css";

export const metadata = { referrer: "no-referrer" as const };

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell">
      <a className="auth-skip" href="#account-content">
        Skip to account form
      </a>
      <header className="auth-header">
        <Brand />
        <Link href="/#faqs">Need help?</Link>
      </header>
      <main id="account-content" className="auth-main">
        <p className="auth-mobile-label eyebrow">Digital wedding suite</p>
        <div className="auth-card">
          <aside className="auth-editorial" aria-label="About Make My Marriage">
            <div>
              <p className="auth-pill eyebrow">Digital wedding suite</p>
              <h2>
                Your wedding.
                <br />
                <em>Beautifully organized.</em>
              </h2>
              <p>
                One shared workspace for your family, celebrations, decisions,
                and all the little details.
              </p>
              <div className="auth-preview">
                <p className="auth-preview-label">Illustrative workspace</p>
                <h3>Rakesh &amp; Priya’s Wedding</h3>
                <p>Shared family workspace · Pune</p>
                <dl>
                  <div>
                    <dt>Haldi ceremony</dt>
                    <dd>13 Feb</dd>
                  </div>
                  <div>
                    <dt>Confirm floral decor</dt>
                    <dd>Neha</dd>
                  </div>
                  <div>
                    <dt>Household replies</dt>
                    <dd>42 of 60</dd>
                  </div>
                </dl>
                <div className="auth-tags">
                  <span>Haldi</span>
                  <span>Sangeet</span>
                  <span>Wedding</span>
                </div>
              </div>
            </div>
            <p className="auth-editorial-note">
              More time for the moments.
              <br />
              Less time managing the details.
            </p>
          </aside>
          <section className="auth-content">{children}</section>
        </div>
        <p className="auth-caption">
          A little more together. A little less to worry about.
        </p>
      </main>
      <footer className="auth-footer">
        <span>Make My Marriage</span>
        <Link href="/">Back to homepage</Link>
      </footer>
    </div>
  );
}
