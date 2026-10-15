# Make My Marriage — Approved Decision Record

**Date:** October 15, 2026. User approved the recommended conflict resolutions and root scaffold in this conversation. This records design decisions, not proof of implemented business behavior.

## Authority

Latest explicit user decisions win. Architecture governs deployment, Database Design governs data/invariants, API Design governs contracts, and PRD governs compatible product behavior. Do not silently change another source's requirements. Implementation evidence lives in [Implementation Status](Wedding-Implementation-Status.md).

## Adopted resolutions

| Area | Superseded requirement | Approved baseline |
|---|---|---|
| Application | Unselected stack/hosting | One Next.js TypeScript App Router modular monolith, Node.js backend, one Vercel deployment |
| Persistence | Separate services/data possibilities | One Atlas application DB per environment, 26 designed shared collections, wedding scope |
| Identity | Owner/manager/member ambiguity | App-owned email/password, no Better Auth; ADMIN/MANAGER only |
| Membership | Manager may invite; active membership ambiguity | ADMIN-only administration; unique user membership retained after removal, same-wedding reactivation only; preserve last ADMIN |
| RSVP | Independent per-event response, no cap, per-event deadline | One household response/count across invited events, maxGuests includes representative, optional shared soft deadline |
| Expenses | Estimates/agreed costs/payments/outstanding balance | Simple actual positive expenses, receipts, optional wedding budget; no ledger/bookings |
| Vendors | Discovery excluded, service bookings | Manual contacts plus attributed Google Places discovery; save place ID/organizer data and event associations |
| Gallery | Upload-only venue and dedicated photographer grants | Shared gallery viewing/enabled uploads through one token/link/QR; photographers use same access |
| Archive | Owner-only terminology and universal mutation ban | ADMIN archive; narrow ADMIN privacy exceptions and authenticated system cleanup; recovery remains available |
| Event drafts | Incomplete draft and required publication contact | Follow API/DB required core fields even for draft; contact optional; scheduled/completed eligible |
| Cancellation | Cancelled cards remain in active guest view | Suppress cancelled/removed events from active guest/public output; retain internal history |
| Private website | Separate publish flow without matching schema/API | Direct save through wedding settings; no additional private publish flag or endpoint |
| Public website | Risk of conflating private/public publication | Explicit selected snapshot at /w/:slug, default unpublished, immediate cancellation suppression, no private capabilities |
| API paths | Illustrative architecture /api routes | /api/v1 browser contracts; absolute /api/internal/jobs/tick and /api/webhooks/* |
| Tooling | No established package manager | npm, exact dependency versions/lockfile, strict TypeScript, Tailwind semantic tokens, ESLint |
| UI | Proposed guideline treated as finished brand | Supplied Stitch homepage/login designs take precedence when available; neutral placeholder until then |
| Phase 0 | Scaffold confused with provider feasibility validation | 0A local scaffold; 0B outstanding technical gates before dependent releases |

Cloudinary, Resend, Ably and Google Places are the selected integrations. WhatsApp remains manual only. No separate Express service, always-running worker, microservices, Redis, guest accounts/OTP or payment processing.

## API section 24 incorporated into database specification

- emailCampaigns persists bounded immutable audienceHouseholdIds, manifestHash and preparation cursor before acknowledgement; delivery materialization is recoverable.
- Import retries use stable importId/clientRowId, canonical hashes and resource references within existing idempotency infrastructure.
- uploadIntents persists validated task/design/expense context where relevant and rechecks scope at finalization.
- Public draft changes/publish require expectedDraftVersion; unpublish requires expectedPublishedRevision.
- Initial gallery viewing and guest uploads are disabled; organizers deliberately enable them.

These clarify the existing 26 collections. No database or API was created by documenting them. Numeric processing limits remain bounded implementation defaults subject to validation, not purchased product promises.

## Outstanding decisions/validation

Stitch exports; final brand tokens; onboarding timezone/currency defaults (recommend Asia/Kolkata and INR, not yet implemented); reminder timings; exact media/storage limits; HEIC and protected original delivery; provider plans/cron cadence/cost; Atlas/Vercel region/network boundary; sender domain; crypto work factors/token lifetimes/rotation; recovery/export drills and measured performance/concurrency.

Cancellation messaging needs type-specific eligibility: a safe cancellation notice must not be rejected solely because normal upcoming-event eligibility excludes cancelled events. Resolve the precise contract before that feature, without restoring cancelled events to active guest views.

Incomplete event drafts, moving users between weddings, refund/negative accounting, archive reopening, custom domains and additional publication states require explicit future decisions. They are not silently added by the scaffold.
