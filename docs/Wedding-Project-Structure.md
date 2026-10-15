# Make My Marriage — Project Structure

**Updated:** October 15, 2026. Application root is the existing make-my-marriage repository at C:/Users/rk751/Downloads/WeddingManagement. No nested app, git init or separate backend.

## Phase 0A paths

```text
WeddingManagement/
  docs/                              existing designs plus decisions/structure/status
  src/
    app/
      layout.tsx                     root layout, Node runtime, shell metadata
      page.tsx                       technical placeholder awaiting Stitch
      not-found.tsx                  unavailable-page state
      globals.css                    Tailwind and provisional semantic tokens
    infrastructure/
      config/env.ts                  server-only validated APP_ORIGIN
  .env.example                       safe configuration names/placeholders
  .gitignore                         dependencies/builds/env/log exclusions
  .mcp.json                          existing project configuration, preserved
  AGENTS.md                          project guidance and Next-generated agent rules
  package.json / package-lock.json    npm scripts and exact dependency resolution
  tsconfig.json / next-env.d.ts       strict TypeScript and framework types
  next.config.ts                     Next configuration
  eslint.config.mjs                  Next/TypeScript lint rules
  postcss.config.mjs                 Tailwind build integration
  README.md                          setup and development instructions
```

node_modules and .next are generated/ignored. Future directories below are a plan; create them only with real implementation.

docs/history preserves the original PRD/UI/development-plan snapshots as explicitly superseded references. Current documents and the decision record govern implementation.

## Application growth plan

```text
public/                              approved public brand/marketing assets only
src/
  app/
    (marketing)/page.tsx             move placeholder here when real marketing starts
    (auth)/                          login/register/verify-email/forgot/reset-password
    (onboarding)/                    create-wedding/accept-invitation
    (family)/                        shared authenticated layout
      dashboard/ events/[eventId]/ guests/[householdId]/
      tasks/[taskId]/ vendors/[vendorId]/ expenses/[expenseId]/
      invitations/designs/[designId]/ campaigns/[campaignId]/
      announcements/ website/ photos/ members/ settings/
    (guest)/invite/[secret]/         exchange household link; redirect to /guest
    (guest)/guest/                   private invited-events/one-RSVP experience
    (gallery)/gallery/[secret]/      exchange shared token; redirect to /gallery
    (gallery)/gallery/               viewing/enabled uploads; same photographer scope
    (public-wedding)/w/[slug]/       published public snapshot
    api/
      v1/                            exact paths from API Design, added per feature
        auth/ weddings/[weddingId]/ membership-invitations/
        access/ guest/ gallery/ media/ public/ realtime/
      internal/jobs/tick/route.ts    bounded scheduler handler
      webhooks/resend/route.ts       verified callback
      webhooks/cloudinary/route.ts   verified callback
  components/
    ui/ layout/ feedback/            genuinely shared presentation
  modules/
    identity/ weddings/ events/ guests/ invitations/ tasks/
    vendors/ finance/ media/ realtime/ notifications/
  infrastructure/
    config/ mongodb/ security/ cloudinary/ resend/ ably/
    google-places/ jobs/ observability/
  shared/
    api/ errors/ formatting/         small cross-feature helpers
scripts/
  migrations/ seed/ reconciliation/ explicit maintenance and synthetic data
tests/
  integration/ e2e/                 add with meaningful business journeys
```

Route groups in parentheses do not alter URLs. This abbreviated tree shows list/detail areas, not every page or all 105 endpoint files. The campaigns area belongs under invitations. Avoid both src/app/page.tsx and (marketing)/page.tsx at once: move the root page when introducing its group. Add loading/error boundaries when actual data-driven screens need them.

## Feature convention

Example modules/guests: components/, schemas.ts, types.ts, service.ts, repository.ts, service.test.ts. Split further only as complexity warrants. Unit tests live next to domain services; integration and browser journeys live in tests. Shared invitation editor UI stays in its owning invitations module, not a global validation or catch-all library folder.

Pages/Route Handlers authenticate/parse/delegate. Services enforce current wedding scope, role, lifecycle, record versions and invariants. Repositories require explicit authorized wedding scope. Provider-specific payloads stay in infrastructure adapters. Server Components may call services directly; client components use safe DTOs and API contracts. Mark server files with server-only; import client-safe types separately.

All wedding media/receipts belong in Cloudinary, not public/. MongoDB holds metadata/state. No booking/payment ledger or dedicated photographer permission module. One deployment can execute multiple functions; persistent correctness never relies on local memory.
