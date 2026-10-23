# Make My Marriage

A wedding planning application for couples and families. One Next.js/TypeScript modular monolith, one Vercel application deployment, and one MongoDB Atlas application database per environment.

## Current state

The scaffold, homepage/logo, application-owned accounts, wedding onboarding and ordinary wedding-detail editing are implemented. Verified users can create one private wedding and view its saved overview. Active ADMIN/MANAGER members can edit ordinary details with version conflicts and expense-based currency locking. Events, family invitations and remaining wedding planning features are pending. Live Resend delivery and deployment checks remain pending. Public/account screen previews need no credentials; saving a wedding requires MongoDB and server keys.

See [Project Status](docs/Wedding-Project-Status.md) for the ongoing major-feature progress log and next steps. See [Implementation Status](docs/Wedding-Implementation-Status.md) for detailed verification evidence and remaining technical work. See [Decision Record](docs/Wedding-Decision-Record.md) for approved conflict resolutions.

The [Document Compliance Audit](docs/Wedding-Compliance-Audit.md) maps every product area to the actual implementation and records open findings; a working scaffold does not mean the full application is implemented.

## Local setup

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

The check is read-only. Migration explicitly installs seven account and four onboarding collections with validators/indexes; it is repeatable and must run before writes. It requires a transaction-capable MongoDB deployment and migration permissions. Runtime does not create schema automatically.

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
