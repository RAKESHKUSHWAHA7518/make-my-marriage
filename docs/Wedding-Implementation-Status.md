# Make My Marriage — Implementation Status

**Updated:** October 22, 2026 (Asia/Kolkata).
**Scope:** Scaffold, homepage/logo and account feature. Earlier dated entries are historical snapshots.
**Repository:** RAKESHKUSHWAHA7518/make-my-marriage, existing root checkout.
**State:** Account code implemented and locally tested. Live email and production gates remain; wedding onboarding and remaining Phase 1 work are not implemented.

**User acceptance — October 22, 2026:** The user approved the delivered account feature after testing and code review and requested the status update, commit and GitHub push on dev. Project Status now summarizes the final 16-test account result, separate environment test, browser QA corrections and remaining live-provider gates. Prior no-commit statements describe their original implementation checkpoints. Resolve the new checkpoint identity from Git history; approval does not imply deployment or live-email validation.

**Document audit:** The historical scaffold [Compliance Audit](Wedding-Compliance-Audit.md) counted 105 designed operations and 26 designed collections. The account checkpoint now implements eight auth operations plus account-scoped job tick and Resend webhook, and seven collections. The remaining 95 operations and broader worker/provider use cases are future work.

## Accounts — October 21, 2026

**Implemented:** Login from supplied Stitch desktop/mobile exports; registration, verification/resend, forgot/reset password, protected `/account` welcome and logout. Homepage links now reach the real account routes. No wedding dashboard or simulated login was added.

**Boundaries:** Thin Node Route Handlers in `src/app/api/v1/auth`, business rules in `src/modules/identity`, server-only MongoDB and Resend adapters in `src/infrastructure`, reusable client form in `src/components/auth`. Eight auth contracts use strict DTOs, request IDs, no-store responses, neutral email responses, trusted-origin/custom-header CSRF checks and MongoDB rate limits. The internal tick and webhook support account mail only.

**Security:** Argon2id (64 MiB, three passes, one lane), 12–128-character new passwords, 32-byte random tokens stored as hashes, seven-day opaque sessions, 24-hour verification and 30-minute reset links. HTTPS uses a Secure/HttpOnly/SameSite=Lax `__Host-` cookie. Atomic reset consumes tokens and increments credentialVersion, invalidating every earlier session. Verification does not sign users in. Email links carry tokens in URL fragments; auth pages set no-referrer. Missing configuration fails without false success or account creation.

**Persistence:** Applied explicit repeatable `001-accounts` migration to the configured initially empty development database: users, sessions, authTokens, rateLimits, deliveries, jobs and webhookReceipts. Unique/TTL/dispatch indexes and validators are installed. Writes refuse to proceed without required unique indexes. Membership is read only for account DTOs; wedding/membership migrations remain future work. Secret values were never printed. Local security keys were generated in ignored `.env.local`.

**Email:** Account/token/delivery/job intent commits atomically. Recipient and immutable payload are encrypted; worker claims MongoDB leases, processes at most two jobs per invocation, retries with the same Resend idempotency key within 23 hours, and removes terminal/expired payload secrets. Signed callbacks persist/reconcile delivery facts and suppress bounced/complained recipients. `after()` attempts sends; authenticated tick/manual processing handles durable retries. No scheduler deployment has been configured.

**Verification:** Auth integration suite passes 13 subtests plus parent (14/14), including concurrent registration/reset, expired/reused links, session rotation/logout/revocation, strict fields/CSRF, concurrent persistent rate limits, missing configuration, immutable provider retry and signed duplicate bounce suppression. Tests use a uniquely named temporary MongoDB database and remove it afterward; provider fetches are mocked only within tests. No real email was sent. Local Argon2id benchmark on the final test run: 321 ms; this is not Vercel performance evidence. A sandbox-only rerun lacked MongoDB network access; rerun with network permission passed. Type checking passed. Final build/lint evidence is recorded below.

**Browser evidence:** Invalid login shows the generic credential error; empty form focuses email and displays field errors. Recovery without Resend configuration shows service unavailable. Reset without a token is disabled with a new-link action. Unauthenticated `/account` redirects to login. Mobile login at 390px renders the form without the desktop illustration.

**Still required:** Verify live email journeys, configure signed webhooks and frequent scheduler before release, verify native Argon2 on Vercel, environment isolation/network boundaries, monitoring/recovery and secret rotation. Homepage/account visual approval and production legal/contact content remain separate checks. Next incremental implementation: verified-user wedding onboarding. No commit, push or deployment is included.

**Final checks, October 22:** Lint (zero warnings), type checking and the full production build passed. Build inventory confirms five account screens, the protected dynamic welcome page and ten dynamic API routes. The 14/14 integration test result above includes the final migration-readiness and receipt-concurrency changes. Production startup and browser rendering of the login screen passed. Production-only npm audit reports zero vulnerabilities. Local HTTP account testing uses development mode; production authentication deliberately requires an HTTPS origin. The development server is left running at http://localhost:3001. Secrets remain in ignored environment files; no live Resend send was claimed.

## Scaffold implementation (historical Phase 0A)

- Root Next.js App Router/React/strict TypeScript scaffold, @/* alias and explicit Node.js backend runtime.
- Technical placeholder, unavailable-page state and provisional warm ivory/burgundy Tailwind tokens; system fonts, no external assets or provider requests.
- npm dependency manifest/lockfile and dev/build/start/lint/typecheck scripts.
- server-only, Zod-validated APP_ORIGIN; localhost default permits credential-free scaffold builds. Error output includes variable names only.
- .env.example and .gitignore excluding actual environment values, builds, dependency directories and logs. Existing .mcp.json preserved.
- README, approved decision record and actual/future structure documentation.
- AGENTS.md contains project guidance, the supplied Postman CLI note, and the installed Next.js version's automatically generated rules. Read the relevant installed framework guides before future code changes.
- Explicit Turbopack repository root prevents inference from an unrelated parent Downloads lockfile; no other project's files were changed.

## Document alignment completed

| Document | Change |
|---|---|
| PRD v3.0 | Consolidates older flows around ADMIN/MANAGER, one capped household RSVP, actual expenses, manual/Places vendors, shared gallery and archive exceptions |
| Architecture v2.1 | Normalized API authority, feature-local schema organization, actual scaffold versus future tree, Phase 0A/0B boundary |
| Database Design v2.2 | API section 24 audience/hash/cursor, import retry scope, upload context, publication versions and disabled gallery defaults; still 26 collections |
| API Design v1.1 | Persistence clarifications cross-referenced as incorporated in design; 105 operations remain unimplemented |
| UI Guidelines | Corrected role/RSVP/vendor/expense/gallery screens; Stitch authority and pending exports explicit |
| Development Plan | Corrected phase scope/acceptance and separated local scaffold from technical validation gates |

No live database, migration, validators or provider configuration was created by these edits. Cancellation-message eligibility remains a recorded future contract gate.

Original detailed PRD/UI/development-plan snapshots are preserved under docs/history with a superseded notice. Current documents govern implementation. Architecture/Database/API retain their detailed specifications with targeted alignment changes.

## Scaffold verification evidence (October 15)

Executed October 15, 2026 on Windows with Node 22.19.0 / npm 10.9.3:

| Check | Result / evidence |
|---|---|
| Final lockfile clean install | PASS: npm ci --offline --no-audit using downloaded cache; normal npm ci remains the documented setup command |
| npm run lint | PASS: zero warnings after naming the PostCSS config export |
| npm run typecheck | PASS: route type generation and strict tsc; also rerun after stopping dev to restore normal generated type references |
| npm run build | PASS: Next 16.4.1 Turbopack production build, TypeScript and static / plus /_not-found output |
| npm run start -- --port 3100 | PASS: production server ready; HTTP root 200, CSS 200 with theme tokens |
| Unavailable routes | PASS: /missing-page, /login and unimplemented /api/v1/auth/me return 404 with unavailable state; no dummy auth API |
| Shell metadata | PASS: lang=en, noindex and no X-Powered-By header |
| npm run dev -- --port 3101 | PASS: startup, root 200 and missing route 404 |
| Browser | PASS: desktop screenshot inspected, homepage/unavailable page visible, return link works via Enter; no horizontal overflow at 360/390/768/1280px |
| Environment validation | PASS: default localhost and valid HTTPS origin; rejects malformed, FTP, credential-bearing, path-bearing and query-bearing values; errors contain APP_ORIGIN only |
| Documentation | PASS: local Markdown file targets across all 14 Markdown documents, plus manifest/lockfile direct-version agreement and final diff review |
| Secret/generated-file exclusions | PASS: node_modules, .next, .env.local and .env.production ignored; .env.example visible; .mcp.json unchanged |
| git diff --check | PASS after removing trailing whitespace; existing Git line-ending conversion notices are informational |
| Production dependency audit | PASS: npm audit --omit=dev --json reports zero vulnerabilities |
| Full dependency audit | OPEN: five high-severity entries in the development lint-tool dependency chain; details below |

The initial sandboxed build could not start its CSS compilation subprocess. The successful production build and reachable local verification servers ran through elevated execution. A first sandbox-local browser connection timed out; the host-local server was subsequently verified successfully. Both verification servers were stopped. No firewall/security settings were changed. No live credentials or provider network calls are needed by the shell.

Pinned direct versions: Next/eslint-config-next 16.4.1, React/React DOM 19.3.1, Tailwind/PostCSS plugin 4.3.3, TypeScript 6.0.2, ESLint 9.39.5, Zod 4.6.7, server-only 0.0.1. package.json and package-lock.json contain the complete exact set.

## Open tooling findings

- TypeScript 7.0.2 was rejected by typescript-eslint during the first lint attempt; TypeScript 6.0.2 resolves that failure.
- ESLint 10.12.0 ran but falls outside the declared peer ranges of bundled import/React/accessibility plugins. Pin ESLint 9.39.5 for compatible peers; it is deprecated/end-of-support and must be revisited when the ecosystem supports a maintained version. Do not hide peer conflicts with force/legacy-peer-deps.
- Full online npm audit reports five entries along eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces. They derive from [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), a deeply nested glob-pattern stack-exhaustion issue. There was no patched braces release listed in the registry at verification time. npm's suggested eslint-config-next 14.2.35 downgrade is incompatible with the selected Next 16 scaffold and was not applied. These are development dependencies; the production-only audit is clean. Revisit upstream fixes or a supported lint-tool change before release/CI expansion; never pass untrusted glob patterns into this tooling.
- Offline install's displayed zero-advisory result is not security evidence; the online full and production audits above are the evidence.

These local checks are not a full accessibility audit, business/security test suite, Vercel deployment test or provider feasibility validation. No domain unit/integration/e2e suites exist yet.

## Remaining work

| Phase | Status / next work |
|---|---|
| 0A scaffold | Delivered and locally verified; dependency/tool maintenance findings remain open above |
| 0B technical gates | Not started: runtime crypto, Atlas connectivity/transactions, media delivery/formats, Ably capabilities, cron plan/cadence and environment isolation |
| 1 identity/workspace/events | Not started: registration/verification/recovery/sessions, ADMIN invitations, wedding creation/events/dashboard, migrations, audit/version/fence and access tests |
| 2 households/websites/RSVP | Not started: imports, capability links, single capped RSVP, public snapshots and pilot |
| 3 planning | Not started: tasks/comments/announcements, manual/Places vendors, actual expenses and collaboration |
| 4 invitations | Not started: designer/versions, manual WhatsApp, live campaigns/jobs/webhooks/reminders |
| 5 celebration/archive | Not started: protected Cloudinary uploads/gallery/QR, livestream and archive exceptions |
| 6 launch | Not started: integrated security/load/accessibility/provider tests, recovery drills, limits/alerts and real-family validation |

Stitch homepage/login exports were retrieved through MCP. The homepage now replaces the technical placeholder; the login design is available but not implemented. No auth bypass, demo user, in-memory database, business API, provider SDK, persistent worker or deployment was introduced. Zero of 105 API operations implemented. No commits/pushes/deployment are included.

## Homepage and logo — October 16, 2026

**Completed:** First homepage UI based on the supplied Stitch desktop/mobile references, normalized to the user-confirmed burgundy palette. Custom SVG M monogram with interlocking rings, shared header/footer wordmark and favicon. Sections: hero/workspace illustration, family collaboration, feature cards, private household invitation illustration, three wedding-website style illustrations, vendors/expenses, photo gallery, three-step introduction, eight FAQs, closing CTA and footer.

**Interactions:** Responsive menu with expanded state, link dismissal and Escape handling; working in-page navigation; native keyboard-operable FAQ disclosure; account CTAs display an honest availability dialog with native focus containment, Escape dismissal and return focus. Preview controls are static illustrations, not fake forms. No account data is collected.

**Files:** src/app/page.tsx, globals.css and layout.tsx; components/brand.tsx and marketing/site-header.tsx/account-button.tsx; public/brand/logo-mark.svg; three public/images marketing photographs; two app/fonts files with their OFL licenses. No package or lockfile changes. A pinned temporary Prettier invocation formatted only the six changed source files and added no project dependency. The existing .mcp.json edit predates this feature and was preserved.

**Design corrections:** Removed unsupported booking/payment-ledger language, email-client dispatch claims, prototype state controls, nonfunctional legal links and ZIP download claims. Public wedding previews contain no private capabilities. Sample names/counts/expenses are labelled. Public homepage imagery is marketing material from the supplied Stitch export, not private wedding media. The three website styles are illustrations, not an implemented theme editor. Logo/design acceptance remains subject to user visual review.

**Verification (October 16):**

| Check | Evidence |
|---|---|
| npm run lint | PASS, zero warnings after replacing the brand home anchor with Next Link |
| npm run typecheck | PASS, Next route generation and strict TypeScript |
| npm run build | PASS, Next 16.4.1 production compilation and static root/404 output; rerun after final link correction |
| Responsive layout | PASS: 360/390/768/1280px checks, no horizontal overflow; desktop hero and mobile hero/FAQ visually inspected |
| Navigation | All fragment destinations exist; mobile menu opens and closes after selecting FAQs |
| FAQ keyboard behavior | Enter opens the household RSVP answer |
| Account dialog | Login opens availability message and focuses dismissal button; Escape closes it and returns focus to Login |
| Assets | All three gallery images loaded with nonzero natural widths; local logo/fonts render |
| Browser logs | No warning/error entries observed in the final browser check |
| Diff | git diff --check passes; no dependency additions, API stubs or empty feature folders |

Development preview is running at http://localhost:3000 and left open. Screenshots are saved outside the repository in the task visualization directory. Temporary Stitch reference HTML was removed after use. The production build and browser checks are local evidence, not deployment or a full accessibility certification. Existing dependency audit findings remain open; no new dependency audit was claimed.

**Still pending:** User visual review; real registration/login and recovery; all database/API/provider-backed wedding journeys; production legal/contact content before launch; deployment and provider/security/operational gates. Database and API contracts are unchanged. Next feature: application-owned authentication with the supplied login design after homepage review. No commit, push or deployment was performed for this feature.

## Update discipline

The [Project Status](Wedding-Project-Status.md) log, established October 20, 2026, provides the concise major-feature history. Update it whenever a major feature is built or materially changed, alongside the detailed implementation evidence in this file. AGENTS.md requires this ongoing maintenance. The initial log records the scaffold and homepage milestones using their historical verification dates; no application checks were rerun for this documentation-only addition.

### Repository checkpoint — October 20, 2026

After the separate project-status documentation commit, the user requested a local commit of all remaining changes on `dev`: homepage components/styles, logo, marketing images, licensed local fonts, aligned documentation and the existing local MCP port change. No push or deployment is included. Earlier no-commit statements describe the original feature delivery.

Pre-commit verification: type checking passed; the diff whitespace check passed; a common credential-pattern scan of pending text files found no matches. A fresh lint run produced no result and was interrupted, so it is not recorded as passing. The successful lint, build and browser evidence from October 16 remains historical; no new build or browser test was run for this checkpoint.

### Repository checkpoint — October 15, 2026

At the user's explicit request, created the local dev branch from main for the scaffold/documentation checkpoint. The checkpoint includes Phase 0A source/configuration, aligned planning documents, preserved historical references and audit records. Earlier statements about no commits describe the preceding scaffold/audit tasks; this subsequent request authorizes the local commit. No push or deployment is included. Resolve the checkpoint commit identity from git log on dev rather than embedding a self-referencing hash here.

The user explicitly requires a clean, maintainable project without unnecessary clutter. The Development Plan now defines the Clean implementation requirement, and AGENTS.md directs future implementation to follow it. This documentation update adds no application features or dependencies.

### User-requested run check — October 15, 2026

Started npm run dev at http://localhost:3000 and left it running for the user. Browser inspection confirms the styled placeholder and unavailable page render; the return link works with Enter. Homepage and stylesheet return 200; an unknown route returns 404. Captured browser warning/error logs are empty. This confirms the scaffold's current behavior only; authentication and wedding features remain unimplemented. The browser tab is left open. This later run supersedes the earlier verification-server shutdown for the current running state.

For every next change, record implemented files/behavior, checks actually run and outcomes, document/schema/API implications, outstanding gates and the next useful journey. Keep planned, implemented and verified distinct; never mark a provider feature complete from mocks or a build alone.

## Resend configuration check — October 22, 2026

Loaded the effective local environment without displaying secrets. API key and sender email are present; Resend authenticated the read-only domains request and reported the matching sender domain as verified. Encryption/rate-limit keys and cron secret pass format checks. RESEND_WEBHOOK_SECRET is missing. No email was sent and delivery is not yet proven. Environment files remain ignored. Started the development server on port 3001 with the new configuration.

## Review corrections — October 22, 2026

- Fixed callback starvation: process only due receipts, defer unmatched receipts for one minute, and fail unmatched receipts after 48 hours while purging encrypted payloads and retaining minimal facts for 90 days. Added the retry index through the existing repeatable account migration and applied it to the configured development database.
- Maintenance commands now select environment files using NODE_ENV (development by default), preserve process-variable precedence, and skip .env.local in test mode. Database checks use the same loader as migrations/email processing.
- Verification: account integration suite passed 15 reported tests (14 subtests plus parent), including 20 unmatched receipts ahead of a valid callback, late correlation and terminal cleanup. Environment regression test passed for development/production/test selection and shell precedence. Type checking and lint passed. The first restricted lint process stalled; an unrestricted rerun completed successfully. No live email was sent; live provider verification remains pending. No commit or deployment performed.

## Authentication QA corrections — October 22, 2026

Reviewed the supplied authentication-qa-report.md and its linked multi-tab-authentication-qa.md. The main report's 17 cases passed; MT02/MT03/MT04/MT07 identified real UI failures.

- Login and registration now check the server session and redirect signed-in users to /account. Added cross-tab invalidation on login/logout/password reset, with BroadcastChannel, storage fallback and focus/pageshow/visibility revalidation. Signals contain no identity or credentials. Full navigation clears stale account markup; server authorization remains authoritative.
- Added Next.js data-scroll-behavior="smooth" to resolve the route-transition warning. Did not suppress React hydration warnings globally. The reported Grammarly body attributes were absent in the clean in-app browser; no hydration error or scroll warning was captured during the retest. This does not prove how the user's Chrome extensions behave.
- Fixed uncertain email submission: a lost provider response remains submitting during retries, and becomes unknown rather than suppressed when its token expires/is consumed. Regression tests cover both cases without another provider call. Unknown submissions require reconciliation; no automatic blind resend is claimed.
- Verification: 16/16 reported account tests passed (15 subtests plus parent), type checking passed and lint passed. Browser retest confirmed shared sessions, signed-in redirects from login and register, automatic logout in both directions, and an open login tab following sign-in in another tab. Browser-test account was created directly without email delivery; only its own account/session records are removed after verification. The original report's account remains unchanged.
- External QA files remain historical evidence; results are recorded here inside the repository. Live inbox verification/reset delivery, signed provider callbacks and production environment gates remain pending. No commit/push/deployment included.

Final QA delivery check: production build passed with login/register correctly rendered dynamically for server-session checks. The disposable QA account and its sessions were removed successfully; no mail was sent. Targeted diff whitespace check passed (the user's unrelated .env.example trailing blank line was left unchanged).
