# Make My Marriage — Implementation Status

**Updated:** October 23, 2026 (Asia/Kolkata).
**Scope:** Scaffold, homepage/logo, accounts, wedding onboarding and ordinary wedding-detail editing. Earlier dated entries are historical snapshots.
**Repository:** RAKESHKUSHWAHA7518/make-my-marriage, existing root checkout.
**State:** Accounts and onboarding implemented, locally tested and user-approved. Live email, production gates and remaining Phase 1 journeys are pending.

**User acceptance — October 23, 2026:** The user approved wedding onboarding, saved overview and the logout/countdown/date-validation follow-ups, and authorized this checkpoint's commit and push to GitHub on dev. Historical pending-approval and no-commit statements below retain their original context. Live email, forced lost-save-response browser testing and production gates remain open. The repository commit records the checkpoint identity.

**User acceptance — October 22, 2026:** The user approved the delivered account feature after testing and code review and requested the status update, commit and GitHub push on dev. Project Status now summarizes the final 16-test account result, separate environment test, browser QA corrections and remaining live-provider gates. Prior no-commit statements describe their original implementation checkpoints. Resolve the new checkpoint identity from Git history; approval does not imply deployment or live-email validation.

**Document audit:** The historical scaffold [Compliance Audit](Wedding-Compliance-Audit.md) counted 105 designed operations and 26 designed collections. The current checkpoint implements 14 operations (eight auth, account job tick, Resend webhook, four wedding operations) and 11 migrated collections. The remaining 91 operations and broader provider use cases are future work; wedding PATCH supports only its documented initial subset.

## Edit wedding details — October 23, 2026

Implemented `/wedding/details` and PATCH `/api/v1/weddings/{id}` for ordinary wedding details only. Reuses onboarding fields/styles and supplied Stitch Edit Wedding Details desktop `1053a2fbbc534f3db4876f9c7b8ce523` / mobile `03c1fab100a145bbab1ba221151756c7` from project `1860855833908619349`. Existing logo/fonts/burgundy/ivory preserved. No preview switches, concierge, photography, OWNER, auto-sync claims or archive reactivation controls. No new dependency.

Both ADMIN and MANAGER may edit. Partial strict payload requires expectedVersion; omitted fields remain unchanged and explicit null clears optional date/budget. Names/title stay independent. Exact nonnegative money conversion supports zero. Native partial-date validation is retained. Success navigates to refreshed saved overview/countdown. Cancel and conflict reload confirm discarding dirty values; browser unload warns. Network errors preserve the in-memory immutable submission for Retry. A lost successful response can produce VERSION_CONFLICT on Retry; user must reload the saved details rather than overwrite. No automatic retry or browser-storage persistence is claimed.

Server derives wedding scope, checks trusted origin/CSRF/session and applies persistent rate limiting. Transaction takes active-wedding writeFence, rechecks/locks current actor and membership, enforces expectedVersion and records activity. Concurrent changes have one winner. Removed/foreign memberships cannot edit; archived details render read-only and reject writes. Currency changes check any retained expense, including soft-removed rows; safe settings DTO adds currencyLocked. Future expense creation must use the same documented wedding fence. No expense API/collection migration or publication/settings expansion is implemented. Public snapshot/gallery remain unchanged; couple/date edits mark public source stale.

Verification: expanded isolated wedding suite passed 11 reported tests (10 subtests plus parent), including optional clearing/zero budget, partial/strict schema, privacy preservation, MANAGER edits, currency lock, archive/removal/tenant restrictions and racing edits. Temporary test database dropped. Type checking and lint passed before final read-only presentation refinement. Browser QA could not proceed: CUA refused the existing tab under its URL policy; no alternate browser workaround was attempted. Disposable synthetic browser fixture was removed without changing personal records or sending email. Visual approval, browser save/conflict/dirty-navigation checks and lost-response fault injection remain pending. No commit, push or deployment in this delivery.

Final edit-details checks: production `npm run build -- --webpack` passed after the read-only presentation refinement, including TypeScript compilation and `/wedding/details` route generation. Final lint and diff whitespace checks passed. The prior default Turbopack limitation remains unchanged. No new browser screenshot is available for this delivery.

**Independent browser QA follow-up — October 23:** The app was initially stopped; started the documented webpack dev server on port 3001. Isolated-browser tests passed overview-to-editor navigation/prefill, required validation, all seven editable fields, saving state, refreshed overview/countdown, optional clearing, stale-version rejection, expense-based currency locking, other edits/zero budget while locked, archived stale-write rejection and fresh read-only rendering. Existing integration suite passed 11/11 reported tests. Cancel left saved values unchanged, but native confirmation handling made conflict reload inconclusive; do not claim accept/dismiss or unload coverage. Scoped captured console warning/error log was empty. Synthetic fixtures removed; personal records and application code unchanged. See [full QA steps, results and limitations](Edit-Wedding-Details-QA-2026-10-23.md). Screenshots are retained outside the repository. User visual approval and lost-response fault injection remain pending.

## Wedding onboarding — October 23, 2026

**Implemented:** Protected `/wedding/create` and `/wedding`, linked from `/account`. Stitch project `1860855833908619349`, named `MMM — Wedding Onboarding V1`: desktop create `ddc91a136e24456ba44554e13bdfe637`, mobile create `376316d989af4b18a512b6624654f222`, desktop overview `9870e98c44e84ffcb69d67f321891a62`, mobile overview `3f76a5cf443343c5ae6ad6a91365181d`. All three named state boards reviewed. Existing logo/local fonts preserved; no dependency added.

**Design reconciliation:** Exports invented an Add Guest heading, concierge/consultation services, partner access, IDs, scheduled progress and encryption/diagnostic claims. Omitted under the user's explicit brief. Single-page editable form, optional date/budget; no fake stats, draft autosave or unsupported controls.

**Contracts/persistence:** Thin Node handlers: POST `/api/v1/weddings`, GET `/api/v1/weddings/current`, GET `/api/v1/weddings/{id}`. Server-only service enforces verified account, retained single-wedding membership, actor/operation-scoped request-hashed idempotency and tenant isolation. Transaction commits wedding, first ADMIN membership, activity and completed idempotency record. Unique slug retries collisions. Initial gallery secret is encrypted using independent `CAPABILITY_ENCRYPTION_KEY`; safe DTOs omit secrets/hashes. Public page unpublished, gallery/uploads disabled. Explicit repeatable migration 002 adds four collections with validators, unique indexes and TTL; applied to development. Writes refuse missing required unique indexes.

**Input defaults:** 200-character names/title, valid date-only calendar value and IANA timezone. Initial supported currencies INR/USD/GBP/EUR/AUD/CAD/SGD/AED, all with two decimal units. UI ordinary amounts convert exactly to API integer strings and BSON Long; maximum 9223372036854775807 minor units. No arbitrary future-date requirement. Storage allowance starts at zero while media is disabled; configure an explicit allowance before enabling media. No currency editing endpoint in this increment; future expense-based lock remains required.

**Reliability:** Duplicate submission disabled. Errors preserve values. Unknown outcomes retain the immutable payload/idempotency key for Retry, locking edits until resolved. No private form copy in localStorage. Removed membership cannot create another wedding. New routes participate in cross-tab session invalidation. Overview loading/errors show no synthetic data.

**Verification:** `test:weddings` passed eight reported tests (seven cases plus parent): strict schema/money/date, unverified/key rollback, identical/different-key races, changed-payload conflict, membership uniqueness, cross-wedding isolation, safe DTOs, archived reads, removed access/replay and HTTP session/origin checks. Disposable database dropped. `test:auth` passed 16 reported tests; types and lint passed. Production `npm run build -- --webpack` passed. Default Turbopack build failed because its CSS Node subprocess exited before connecting, including outside the sandbox; default build is not recorded as passing and project compiler defaults remain unchanged. Supported fallback: `npm run dev -- --webpack --port 3001`.

**Browser:** Disposable verified account, no email sent: sign-in → account → create, required-field errors, suggested/editable title, disabled saving and persisted overview with ADMIN, Date not decided, exact INR 5,00,000.01, Unpublished and Not enabled. A second test with optional fields blank persisted a custom title and showed Budget not set after reload. Existing-wedding, removed-access and unverified-email gates verified. Desktop and 390px mobile form/overview inspected; mobile document width equals viewport width. Screenshots saved outside the repository. No application error logged; an expected Fast Refresh full-reload development warning appeared while editing. Forced network-failure/Retry and overview error states are implemented but were not browser fault-injected. Signed out; disposable UI account, sessions and wedding records removed. Real accounts preserved.

**Remaining:** User visual approval, Vercel/security/provider/scheduler gates. Invitations, settings mutations, archive actions, events/dashboard, public publication and media remain unimplemented. No commit, push or deployment included.

## Onboarding date validation correction — October 23, 2026

Fixed the code-review finding in `create-wedding-form.tsx`: before preparing a new submission, check the native date input's `validity.badInput` when a date is enabled. Incomplete native entries can expose an empty value; they now produce an accessible inline wedding-date error and focus the field instead of silently saving without the date. Valid blank optional dates remain allowed. The check does not run for an existing immutable retry payload, preserving unknown-outcome retry behavior. Server schema validation remains unchanged.

Verification: type checking, lint and diff whitespace checks passed in the correction delivery. Reviewed the blank-date, disabled-date and retry branches. Independent browser follow-up on October 23 used a disposable synthetic verified account: native keyboard ArrowUp in an otherwise empty enabled date control produced `value=""`, `validity.badInput=true`. With all other required fields valid, submitting showed the complete-valid-date inline error and focused the date field. A complete date cleared that error; a genuinely blank date (`badInput=false`) and an explicitly undecided disabled date remained accepted by date validation. The latter cases used an intentionally invalid timezone to prevent saving. Cleanup confirmed zero test memberships, then removed only the disposable account/sessions. Screenshot: task visualization `partial-date-validation-20261023.png`. No live email, application-code change or new dependency in this verification follow-up. Immutable lost-response retry remains code-reviewed, not browser fault-injected. No API/database contract change, commit, push or deployment.

## Wedding countdown — October 23, 2026

**Independent browser QA:** See [Onboarding QA — October 23](Onboarding-QA-2026-10-23.md) for twenty executed manual onboarding cases, expected/actual results, 8/8 onboarding and 3/3 countdown suite results, test-data cleanup and diagnostics. No application code changed in this QA delivery. Chrome captured a hydration mismatch involving Grammarly body attributes; the scoped isolated-browser log was empty. Forced lost-save-response and live email remain unverified.

At the user's explicit request, the saved overview now displays calendar days remaining when `weddingDate` exists, calculated in the saved wedding timezone. Date-only storage has no ceremony time, so no hours/minutes/seconds are fabricated. Wedding-day and factual past-date messages replace negative remaining counts. Undecided/invalid dates show no counter; the existing Date not decided state remains. A small client component refreshes the derived display every minute and on tab focus/visibility, with server-derived initial text to avoid timezone hydration differences. No database/API/publication changes or dependency added; no full dashboard claimed. Signed out and removed the disposable QA account, sessions and wedding records after verification; viewport restored.

Verification: `npm run test:countdown` passed three tests covering different timezone dates at one instant, today/past dates, DST spring/fall transitions, leap days and missing/invalid inputs. Lint, type checks and `npm run build -- --webpack` passed. Browser QA with a disposable dated wedding showed 114 days until 14 February 2027 on desktop/mobile, Today for the local wedding date, and no counter after clearing that test date. Mobile has no horizontal overflow. Screenshots saved outside the repository; real wedding dates were never changed. User visual approval and production gates remain pending. No commit, push or deployment.

## Logout layout correction — October 23, 2026



The header logout control now reserves the same label width for Sign out and Signing out…, with one accessible label at a time. Header errors appear in a bounded, wrapping alert below the control instead of widening the account row. Header brand can shrink/wrap at narrow widths; hover/pending styling keeps readable burgundy-on-blush contrast. Shared account/gate logout controls retain normal inline error feedback. No authentication API/session behavior was changed.

Verification: type checking and lint passed; diff whitespace check passed. A temporary localhost-only QA proxy delayed and failed logout without revoking the test session. At 360px, idle and pending button widths were both 74.225px; the failure alert stayed inside the viewport at 320/360/390/768/1280px, with no horizontal overflow. Real application logout returned to login. Temporary QA proxy stopped; disposable account/sessions removed and viewport restored. Screenshots are outside the repository. No email sent, new dependency, commit, push or deployment.

## Onboarding visual follow-up — October 23, 2026

The user correctly identified that the first delivery implemented behavior with simplified visuals. The seven named Stitch V1 references now drive the following presentation work. This supersedes the initial delivery's visual-completion implication; its historical functional evidence remains valid.

| Reference | Implemented presentation |
|---|---|
| Create Wedding — Desktop | Centered heading/card, suggested-title badge/edit icon, timezone icon, full currency names, privacy callout, aligned actions and account header |
| Create Wedding — Mobile | Three icon-led sections, single-column white form card, separate blush privacy panel and full-width primary action |
| Saved Overview — Desktop | Three aligned detail cards, consistent SVG icons, ADMIN/account identity and saved-details notice |
| Saved Overview — Mobile | Role/lifecycle heading, responsive card titles, labelled rows with separators and privacy status pills |
| Validation and Save States | Inline error icons/borders, first-invalid-field focus, disabled/spinning save presentation, preserved-values failure alert and Retry |
| Verification and Access States | Three individually selected cards with accent bars, icons, actual account/wedding text and three supplied locally stored Stitch images; real resend action reuses existing account API |
| Overview Loading and Error States | Ivory/blush three-card skeleton with accessible loading status and reduced-motion support; illustrated error card with Retry and Back to account |

Design-board tabs, variant numbers, diagnostics, concierge claims, auto partner access, fabricated IDs/progress and encryption promises remain excluded. These references represent states in the real flow, not seven new production routes or a public component playground. No API/database contract change, new dependency or provider delivery is included. Account names/roles come from the current session/membership; no ADMIN role is invented before creation.

Checks: strict types, lint and `npm run build -- --webpack` passed; onboarding integration suite passed eight reported tests. Browser QA exercised desktop/mobile creation, validation/saving, saved overview and all three access cards. A missing target on the disposable membership deliberately triggered the overview error: Retry remained usable on repeated failure and recovered the saved overview after restoration. Loading fallback was observed during navigation/retry. Form has no horizontal overflow at 360/390/768/1280px; first-invalid-field focus verified. Screenshots live outside the repository. A development LCP image warning was corrected by eager loading/sizing above-fold local images; deliberate missing-record tests create expected development error logs. No live verification email was sent. Signed out and removed the disposable account, sessions, wedding/membership, activity and idempotency records; real data preserved.

User visual approval, forced lost-save-response browser testing, live email and production gates remain pending. The default Turbopack limitation from the original checkpoint remains; the supported alternative compiler build passes. No commit, push or deployment performed.

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
