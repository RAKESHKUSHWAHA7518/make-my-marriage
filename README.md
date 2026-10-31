# Make My Marriage

## Expense Tracking — October 31 increment

/wedding/expenses supports private actual-spending list/add/details/edit/removal, category/event/date filters, pagination and saved dashboard totals/budget comparisons. Verified active ADMIN/MANAGER manage; archive is read-only. Money uses exact minor units and wedding currency; recording any expense permanently locks currency, including after removal. Vendor linking and receipt uploads remain future increments.

Migration 011 creates only the expenses validator/four indexes; it was tested in isolation, then only migration 011 was applied to shared production on October 31 with explicit user approval. Strict validation/four indexes were verified; existing record counts and wedding currency/budget/gallery/storage values were unchanged. No test records were created. Existing local configuration points to production: do not run broad db:migrate or create test expenses there. Run npm run test:expenses only with MONGODB_URI explicitly pointing to the dedicated loopback replica mongodb://127.0.0.1:27192/?replicaSet=expensesqa. Tests assert that server and generate/drop their own random databases; no .env fallback. See project/implementation records for design references, verification and activation gates.

## Guest photo uploads — October 30 increment

Guest upload controls and account-free selection/progress/retry/results are implemented from the seven supplied Stitch references. Active ADMIN/MANAGER explicitly enable uploads on Gallery sharing after enabling viewing. Shared-link visitors and eligible household visitors upload only gallery photos; current permissions are rechecked before saving. Archive blocks unfinished uploads. JPEG/PNG/WebP, 20 MB/photo, twenty-file queue; no guest removal or original download. Family/guest transfers share retry/verification/quota/cleanup behavior.

Migration 010 extends uploadIntents guest actors and adds one partial unique index. It creates no photos/sessions and enables no wedding; tested locally, then applied only migration 010 to shared production with explicit approval. Strict actor/grant validator, unique partial guest index and preserved existing indexes verified; record counts, gallery permissions/tokens and storage counters remained unchanged. Do not run broad db:migrate against the shared production environment. test:guest-uploads requires an explicitly isolated loopback replica set on port 27190 named gallerysharing; it uses disposable databases/mocked provider and network-free UI checks. Project/implementation records contain verification and remaining activation/release gates. Deployment and scheduled cleanup remain deferred.

## Shared gallery viewing — October 30 increment

Implemented /wedding/gallery/sharing: enable/disable, private link/local QR and ADMIN-only replacement. Guests exchange /gallery#token=… to independent-cookie /shared-gallery without an account. Eligible household invitations also open the enabled gallery. Guest uploads/original downloads stay disabled. Active ADMIN/MANAGER manage settings; archived disable/rotation requires ADMIN. Disabling sharing preserves the private family gallery.

Migration 009 extends capabilitySessions and adds one index; it creates no sessions and enables no galleries. Applied only migration 009 to shared production after explicit user approval; strict validator, conditional grants, new/preserved indexes, unchanged record counts and unchanged gallery settings verified. Do not run broad db:migrate against the shared production environment without approval. test:gallery-access requires the dedicated loopback replica set on port 27190 named gallerysharing; test:gallery-sharing-ui is network-free. See progress/evidence records for remaining QA/activation gates. Deployment and scheduled cleanup remain deferred.

## Family gallery — October 30 increment

Release handoff (user deferred Vercel setup): confirm production domain/plan, configure server secrets, deploy, activate the authenticated scheduler, verify successful ticks and monitor cleanup backlog/failures. Hobby cron runs at most daily and cannot supply the intended every-few-minutes cadence; use a suitable plan or external scheduler. Never put CRON_SECRET in a URL, browser code or Git. Isolated browser upload/view and service removal/cleanup passed; production runtime and scheduling are not yet verified.

/wedding/gallery now supports real family-only photo uploads, saved thumbnails/viewer, pagination, quota and removal with durable provider cleanup. The illustrative UI is at /wedding/gallery/preview. JPEG/PNG/WebP only; 20 MB per photo and 20 per queue. Active ADMIN/MANAGER members may manage media; archive is read-only. Guest sharing/QR/uploads and original downloads are not enabled.

Migration 008 was applied with explicit approval, including the selected 1 GB (decimal) original-file allowance for zero-quota weddings; existing nonzero limits were preserved. New weddings start at 1 GB. Do not rerun broad migrations against production as a test. Cloudinary cloud name/key/secret are server configuration; the secret never reaches the browser. Provider transformation/delivery costs are separate from application original-byte quota.

Operational gate: reliably schedule the existing authenticated GET /api/internal/jobs/tick using Authorization: Bearer <CRON_SECRET>, typically every few minutes on a scheduler/plan that supports that cadence. Media cleanup runs alongside account mail. This repository does not configure a Vercel cron and no external scheduler was verified. Monitor non-2xx results and failed counts; each invocation is bounded and may leave more due work. npm run media:process performs one mutating cleanup pass against the configured environment; use it only as an authorized operator, never for production QA. Until confirmed cleanup runs, removed photos are inaccessible but their used-byte storage remains occupied. Expired/rejected upload targets continue to be reconciled for late arrivals.

Run npm run test:media only with an explicitly isolated loopback MongoDB replica set on 127.0.0.1:27190 (tests refuse the configured Atlas URI and generate/drop asserted random test databases). Run npm run test:gallery-ui for network-free selection/render/retry checks, and npm run media:check for a read-only credential ping. See docs/Wedding-Implementation-Status.md for evidence and open manual/deployed-runtime gates.

A wedding planning application for couples and families. One Next.js/TypeScript modular monolith, one Vercel application deployment, and one MongoDB Atlas application database per environment.

## Current state

The scaffold, homepage/logo, application-owned accounts, wedding onboarding/details and family invitations/access management are implemented. Verified users can create one private wedding and view its saved overview. Only active ADMIN members can edit wedding details; MANAGER members can view them. ADMIN also manages invitations, member roles and removal, with last-ADMIN protection. Event draft list/create/details are implemented with isolated tests; migration 004 is applied; isolated QA passed and the user approved this increment October 25; targeted QA gaps remain. Remaining wedding planning features are planned. Live Resend delivery, family browser QA and deployment checks remain pending. Public/account screen previews need no credentials; saving a wedding requires MongoDB and server keys.

See [Project Status](docs/Wedding-Project-Status.md) for the ongoing major-feature progress log and next steps. See [Implementation Status](docs/Wedding-Implementation-Status.md) for detailed verification evidence and remaining technical work. See [Decision Record](docs/Wedding-Decision-Record.md) for approved conflict resolutions.

The [Document Compliance Audit](docs/Wedding-Compliance-Audit.md) maps every product area to the actual implementation and records open findings; a working scaffold does not mean the full application is implemented.

## Workspace foundation

The signed-in wedding overview now uses the V1 workspace sidebar/mobile navigation. Existing details/family pages are connected; future sections open honest coming-soon pages. `/wedding/sample` is an explicitly illustrative preview, not business functionality or saved dummy records. The user confirms local development currently shares the production database: do not create QA fixtures or run migrations/test mutations there; prepare an isolated development environment first. Production/custom-domain deployment is user-reported, not independently audited here.

## Event management — first increment

Event list, draft creation and saved details are implemented at `/wedding/events`, with a private dashboard timeline. ADMIN and MANAGER may create drafts in active weddings; archived weddings are read-only. Drafts do not publish or send invitations. Version-checked private draft editing is implemented at `/wedding/events/{eventId}/edit`, with safe immutable retries and conflict handling; user-approved October 25 with manual QA and code review reported passing. Explicit Draft → Scheduled is implemented as a confirmed, version-checked action on Event Details. It sends no invitations and publishes no public website; other lifecycle actions and scheduled-detail editing remain future work. User checked/accepted scheduling October 25; agent visual/keyboard QA was unavailable. Private household event assignment is implemented in Guest Management; guest access is implemented below; messaging remains deferred. Explicit migration 004 must be applied to the intended environment before activation; it was applied to the shared production database on October 25 after explicit user approval. Its validator/indexes and local list/create-form loading were verified. No production test events were saved. Do not run `npm run db:migrate` with the current production-connected local environment. `npm run test:events` creates a uniquely named temporary database and removes only that database.

## Task Management — first increment

Tasks list/create/details/edit/status and real dashboard summaries are implemented at `/wedding/tasks`. ADMIN/MANAGER manage active-wedding tasks; archived weddings are read-only. Assignment, optional event/deadline, priority/status, filtering, conflict handling and immutable retries are supported. Migration 005 was applied with explicit user approval; no production test tasks were saved. Run `npm run test:tasks` for isolated task checks. User approved the feature and reports review/testing complete October 25; agent visual/keyboard QA remains unverified. Comments, checklists, attachments, reminders, templates and live collaboration remain planned.

## Guest Management — first increment

Guest groups are implemented at `/wedding/guests`: manual add/view/edit/remove, representative contacts, maximum party size, invited events, notes, search/event/RSVP filtering and saved dashboard totals. One record represents one invitation/family group. ADMIN/MANAGER may manage active weddings; archive is read-only. RSVP starts Pending; private sharing and guest response are implemented below. Delivery and imports remain future increments. Migration 006 was tested in isolation and applied to the shared production database on October 26 after explicit user approval; the households validator and five indexes were verified. Run `npm run test:guests` only with an explicitly separate test server/environment. See [guest verification and limits](docs/Wedding-Implementation-Status.md#guest-management-foundation--october-25-2026).

## Private household invitation sharing and RSVP

Implemented from the eleven supplied Stitch screens: household link loading/copying/replacement, private invitation, household RSVP and edit/receipt, workspace response summaries and guarded failure states. Guests use a private link without an account or OTP; only assigned scheduled/completed events are shown. Responses update on navigation/refresh. No email or WhatsApp message is sent by copying a link. Gallery, publishing, organizer RSVP editing, imports and reminders remain deferred.

Explicit migration 007 creates capabilityLinks/capabilitySessions with validators and six indexes. It was applied to the shared production database after explicit approval; validators/indexes were verified without creating application records. Do not run the broad db:migrate command there. Run npm run test:rsvp for asserted random disposable-database checks and network-free form-handler regressions. See [invitation evidence](docs/Wedding-Implementation-Status.md#private-household-invitations-and-rsvp--october-26-2026) for actual verification and remaining QA/activation gates.

## Local setup

Family & access supports ADMIN invitations/revocation, matching-verified-email acceptance, role changes and access removal. Creation queues durable email and triggers a bounded delivery attempt after the response. Run `npm run email:process` locally to process an existing backlog; a frequent authenticated scheduler is still required for retries in deployment. Resend delivery was confirmed for two invitations on October 23; signed delivery callbacks and production scheduling remain release gates. Run `npm run db:migrate` after updating to apply the extended delivery validator/index; do not run email processing against production from a preview environment. Use `npm run test:members` and `npm run test:invitations` for isolated permission/concurrency checks without live email.

Use Node.js 22.x (verified local version: 22.19.0) and npm 10.x (package manager: 10.9.3). Install dependencies from this repository root:

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. No provider credentials or environment file is required for the scaffold. Optional configuration:

```powershell
Copy-Item .env.example .env.local
```

APP_ORIGIN defaults to http://localhost:3000. A configured value must be a complete HTTP(S) origin without a path, credentials, query or fragment. Before account/link features are enabled, require an explicitly trusted HTTPS production origin. The default is for the scaffold only. Configuration errors report variable names, not values. Do not set NODE_ENV manually; Next.js manages it.

## Verification

```powershell
npm run lint
npm run typecheck
npm run build
npm run start
```

Typecheck generates Next route types before running tsc, so it works before a build. Lint runs explicitly; do not assume build runs it. Stop a running server with Ctrl+C before reusing the port. To use another local port: `npm run dev -- --port 3001` or `npm run start -- --port 3001`.

Builds use bundled Playfair Display and Plus Jakarta Sans fonts and local Stitch marketing images; they do not fetch fonts or provider data. They require installed dependencies, not live provider credentials. npm installation needs registry access. Node dependencies/native build tooling must match the platform used to install them; use npm ci in each environment.

## Structure and boundaries

[Project Structure](docs/Wedding-Project-Structure.md) separates existing paths from future feature paths. Add directories when they contain an implemented feature; do not create the complete future tree upfront. Pages and Route Handlers call feature services; services enforce permissions/invariants and use scoped repositories/provider adapters. Server Components may call services directly without self-HTTP requests. Client components must not import server-only code.

Node.js runtime is explicit in the root layout. One Vercel deployment may execute across multiple managed function instances; no durable state relies on process memory. Future jobs use MongoDB leases and bounded scheduled invocations, not a permanent server. No Express app or Better Auth.

## Configuration and secrets

Actual secrets belong in ignored .env.local locally and environment-specific secret settings on Vercel later. .env.example contains only placeholders. No provider key is NEXT_PUBLIC. Do not commit credentials, guest/gallery secrets, sensitive fixtures or logs. Keep preview/production data and credentials isolated; previews must not send production invitations. The scaffold does not configure Vercel, Atlas, provider accounts, cron or network access.

MongoDB, Argon2id and signed Resend callbacks are implemented for accounts. There is no fake authentication, in-memory persistence substitute or successful mock API.

### Enable account services

Keep your existing ignored environment files; do not overwrite them with the example. Set `MONGODB_URI`, `MONGODB_DB_NAME` and an explicit `APP_ORIGIN` matching the browser origin (for example `http://localhost:3001` when using port 3001). Production requires HTTPS. The homepage's fallback origin does not enable account mutations.

Set independent random 32-byte hex values for `RATE_LIMIT_HMAC_KEY` and `ACCOUNT_EMAIL_ENCRYPTION_KEY`, plus a random `CRON_SECRET` of at least 32 characters. See `.env.example` for a generation command. Preserve the encryption key while encrypted deliveries are pending; plan key rotation before production. Local keys were generated in ignored `.env.local` for this development checkpoint.

Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from your verified sender domain to ignored `.env` or `.env.local`, then restart the server. `.env.local` takes precedence over `.env`. Registration/resend/recovery return an unavailable-service error until email configuration exists; they never pretend an email was sent. Do not put credentials in chat or source control.

```powershell
npm run db:check
npm run db:migrate
npm run dev -- --port 3001
```

The check is read-only. Migration explicitly installs account, wedding, invitation, event, task and household validators/indexes (15 migration-defined collections); it is repeatable and must run against the intended isolated environment before feature writes. It requires a transaction-capable MongoDB deployment and migration permissions. Runtime does not create schema automatically. The shared production database has migrations through 006; do not run the migration command against it without separate approval for 006.

Wedding creation also requires an independent random 32-byte hex `CAPABILITY_ENCRYPTION_KEY` for the initial disabled gallery secret. Preserve this key; never use an account-email key for it. The existing ignored local key is configured. Run `npm run test:weddings` for isolated onboarding integration tests (a uniquely named disposable database is created and dropped). Initial currencies are INR/USD/GBP/EUR/AUD/CAD/SGD/AED. Gallery/media stays disabled with zero storage allowance until a later explicit media configuration. On this machine the default Turbopack build currently fails to connect its CSS subprocess; `npm run build -- --webpack` passed and `npm run dev -- --webpack --port 3001` is the supported local fallback. Compiler defaults have not been changed.

Maintenance commands default to development. For production maintenance, explicitly set `$env:NODE_ENV = "production"` in a dedicated PowerShell session. They load `.env.production.local`, `.env.local`, `.env.production`, then `.env`; existing process variables take precedence. Test mode skips `.env.local`. Keep each environment's database and provider credentials separate. `npm run test:env` verifies this selection without real credentials.

Account emails are durably queued in the same transaction as tokens and attempted after the response. `npm run email:process` retries up to two due jobs. Before release, configure a frequent authenticated scheduler calling `GET /api/internal/jobs/tick` with `Authorization: Bearer <CRON_SECRET>`; no permanent worker is required. Daily scheduling is insufficient for 30-minute password-reset links. Set `RESEND_WEBHOOK_SECRET` and configure Resend to send delivered/bounced/complained events to `POST /api/webhooks/resend` on your deployed HTTPS origin. Provider acceptance is tracked separately from delivery; bounced/complained recipients are suppressed.

`npm run test:auth` runs integration/security tests against a uniquely named temporary database on the configured MongoDB cluster, then drops that exact database. Use a development cluster with test-database permissions. Email calls are mocked only inside tests; no real mail is sent. Vercel native Argon2 execution, live provider delivery, scheduling and production environment isolation still require validation.

Current tooling follow-up: TypeScript 6.0.2 is pinned because the lint parser rejects TypeScript 7. ESLint 9.39.5 matches the bundled Next.js plugins' declared peer ranges but is deprecated; ESLint 10 is outside several of those ranges. Full npm audit reports five high-severity entries in one development lint-tool chain rooted in braces; production-only audit reports zero. See the status document for the advisory and required follow-up. Do not run audit fix --force or downgrade framework tooling blindly.

## Planning sources

1. Latest explicit user decisions.
2. [Architecture](docs/Wedding-System-Design-Architecture.md): deployment/technical boundaries.
3. [Database Design](docs/Wedding-Database-Design.md): data and invariants.
4. [API Design](docs/Wedding-API-Design.md): contracts.
5. [PRD](docs/Wedding-Management-PRD.md): compatible product behavior.
6. [UI Guidelines](docs/Wedding-UI-Guidelines.md) and [Development Plan](docs/Wedding-Development-Plan.md).

Of 105 designed API operations, eight auth operations plus the account-scoped job tick and Resend webhook now exist; the remaining 95 and broader worker/provider use cases are future scope. See the status document before choosing the next task. Update it with each implementation's files, checks, limitations and outstanding work. Commit, push and deploy are separate actions.

Guest activation checkpoint (October 26, 2026): migration 006 was explicitly approved and applied to the configured shared database; households validator and all five indexes verified. No production test guest records were created. Earlier pending-activation guidance for this migration is superseded; do not run other migrations or QA writes against production without authorization.
