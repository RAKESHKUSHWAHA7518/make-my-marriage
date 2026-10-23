# Make My Marriage — Approved Decision Record

### Onboarding implementation — October 23, 2026

**Countdown follow-up:** User explicitly requested days remaining on the saved-wedding overview. Derive calendar days from the saved date in the wedding's timezone; do not invent a ceremony time, countdown when the date is undecided, or negative remaining days. Show a wedding-day message and factual elapsed-days text for a past saved date. This adds private overview presentation, not public publication or the full dashboard.

The user authorized building the named Wedding Onboarding V1 Stitch screens. Latest explicit product rules override export inventions: no concierge services, automatic partner access, Add Guest heading, fabricated progress/domain or end-to-end encryption claims. Existing brand and confirmed burgundy/ivory tokens remain authoritative. Names only suggest an editable title; they grant no access. Initial currencies are INR/USD/GBP/EUR/AUD/CAD/SGD/AED (two decimal units); money is bounded to nonnegative signed BSON Long. Gallery remains disabled with zero initial storage allowance until a later explicit media configuration. No expense-based currency edit lock is claimed implemented before expense/settings functionality. See Implementation Status for actual verification and remaining scope.

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

Homepage/logo visual sign-off; onboarding timezone/currency defaults (recommend Asia/Kolkata and INR, not yet implemented); reminder timings; exact media/storage limits; HEIC and protected original delivery; provider plans/cron cadence/cost; Atlas/Vercel region/network boundary; sender domain; crypto work factors/token lifetimes/rotation; recovery/export drills and measured performance/concurrency.

Cancellation messaging needs type-specific eligibility: a safe cancellation notice must not be rejected solely because normal upcoming-event eligibility excludes cancelled events. Resolve the precise contract before that feature, without restoring cancelled events to active guest views.

Incomplete event drafts, moving users between weddings, refund/negative accounting, archive reopening, custom domains and additional publication states require explicit future decisions. They are not silently added by the scaffold.

## Homepage implementation decisions — October 16, 2026

- User authorized a custom logo and homepage first, before account development.
- Preserve Stitch section order, Playfair Display/Plus Jakarta Sans typography and website-style previews; normalize the application palette to the explicitly confirmed burgundy.
- Correct export references to booked/paid vendors, ledgers and email-client dispatch to the approved simple-expense/manual-vendor/provider boundaries. Omit unsupported ZIP download, real QR codes, fake success and prototype review controls.
- Keep examples separate from functionality: account CTAs open an availability dialog. No signup collection, API, DB schema, integration or authentication behavior is introduced.
- Fonts and three supplied Stitch marketing images are served locally. Font licenses are bundled. Logo is original SVG geometry; no icon/image library dependency.
- Retain the existing root page for this one marketing route; introduce route groups only when additional layouts warrant them.

## Account implementation decisions — October 22, 2026

- User approved completion of account code and will configure Resend credentials later. Missing configuration returns an error; it never creates a fake successful account/email flow.
- Homepage account dialogs are superseded by real login/registration links. Stitch login layout uses the confirmed burgundy palette; other account forms share that layout.
- Use the official MongoDB driver, Argon2id (64 MiB, three passes, one lane), 12–128-character new passwords and opaque hashed sessions/tokens. Initial lifetimes follow Architecture: seven-day sessions, 24-hour verification and 30-minute reset. Vercel work-factor validation remains pending.
- Browser mutations require trusted Origin and a custom CSRF header, with no permissive CORS. Email capability tokens are placed in fragments and submitted as JSON; account pages use no-referrer.
- Account email intent is committed transactionally and encrypted using a dedicated server key. Bounded post-response processing plus authenticated scheduled/manual retries uses durable MongoDB leases and stable provider idempotency keys. No permanent server is introduced.
- Seven collections are explicitly migrated for accounts; the remaining schema and wedding membership rules belong to subsequent features. Current shared worker/webhook implementation handles account mail only. No wedding/API stubs are added.
- Account code/local verification and live provider/production verification are separate milestones. Full Phase 1 remains incomplete until wedding setup, memberships, invitations and events are built.

### Authentication QA behavior — October 22, 2026

Signed-in users visiting login/register return to /account. Same-browser tabs share only credential-free session-change signals and revalidate the server session on focus/visibility/pageshow. Logout clears stale private UI through full navigation; no browser-stored token replaces the HttpOnly cookie. Uncertain email acceptance remains submitting on retry and unknown if eligibility expires, preserving operator-reconciliation semantics.
