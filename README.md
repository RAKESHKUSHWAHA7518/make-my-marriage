# Make My Marriage

A wedding planning application for couples and families. One Next.js/TypeScript modular monolith, one Vercel application deployment, and one MongoDB Atlas application database per environment.

## Current state

The scaffold and first homepage UI are implemented. The Stitch-based responsive homepage includes a custom SVG logo, product previews, navigation, FAQs and honest account-availability dialogs. Login and all business functionality remain unimplemented. No database or provider credentials are needed to preview the homepage.

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

Add MongoDB/Argon2id with Phase 1, provider SDKs as their integrations start, and meaningful unit/integration/browser tests with the first business journey. There is no fake authentication, in-memory persistence substitute or successful mock API.

Current tooling follow-up: TypeScript 6.0.2 is pinned because the lint parser rejects TypeScript 7. ESLint 9.39.5 matches the bundled Next.js plugins' declared peer ranges but is deprecated; ESLint 10 is outside several of those ranges. Full npm audit reports five high-severity entries in one development lint-tool chain rooted in braces; production-only audit reports zero. See the status document for the advisory and required follow-up. Do not run audit fix --force or downgrade framework tooling blindly.

## Planning sources

1. Latest explicit user decisions.
2. [Architecture](docs/Wedding-System-Design-Architecture.md): deployment/technical boundaries.
3. [Database Design](docs/Wedding-Database-Design.md): data and invariants.
4. [API Design](docs/Wedding-API-Design.md): contracts.
5. [PRD](docs/Wedding-Management-PRD.md): compatible product behavior.
6. [UI Guidelines](docs/Wedding-UI-Guidelines.md) and [Development Plan](docs/Wedding-Development-Plan.md).

The 105 designed API operations are future scope, not implemented endpoints. See the status document before choosing the next task. Update it with each implementation's files, checks, limitations and outstanding work. Commit, push and deploy are separate actions; none is part of the scaffold task.
