# Make My Marriage — Development Plan

**Updated:** October 15, 2026. Approved scope follows Architecture, Database Design, API Design and the latest user decisions. Track actual completion in [Implementation Status](Wedding-Implementation-Status.md). No dates, paid plans or launch readiness are implied.

## Phase 0A — Approved scaffold

- Next.js App Router and strict TypeScript in the repository root; Node.js backend runtime.
- npm lockfile, lint/typecheck/build/start scripts, Tailwind semantic tokens and server-only configuration.
- Technical placeholder and unavailable-page state; system fonts and no provider calls/credentials.
- Environment example, secret exclusions, setup/structure/decision/progress documentation.
- Reconcile legacy requirements and API section 24 persistence clarifications in the design documents.
- Verify clean installation, lint, types, production build/start and development/root/404 smoke checks.

Done when the recorded local checks pass. No account, database, API or provider feature is claimed. Homepage/login Stitch exports are now available; see the incremental homepage feature below. Do not create empty feature folders or all 105 API operations.

## Incremental feature — Homepage and logo (October 16, 2026)

User authorized the homepage before authentication, plus a matching logo. Implement the supplied Stitch sections with responsive layouts, a scalable SVG brand mark, local fonts/images, working navigation and FAQs. All wedding data is clearly illustrative. Account actions explain coming-soon availability; no fake signup, backend, QR destination or dead legal links. Verify the UI and record evidence in Implementation Status. Login/authentication is the next feature after visual review.

## Phase 0B — Technical gates, scheduled before dependent features

Validate maintained Argon2id on Node/Vercel, secure sessions and atomic recovery; Atlas transactions/connectivity/network boundary; Cloudinary authenticated delivery/original download/phone formats and cost; Ably capabilities; production cron cadence/plan; environment isolation and secret rotation. These gates remain incomplete until measured, even if 0A passes. Account gates precede Phase 1 release; media/provider gates precede their integration releases.

## Phase 1 — Identity, shared workspace and events

Registration → verify email → sign in → create wedding → invite partner as ADMIN → accept with matching verified email → create event → shared dashboard.

Include recovery/logout, opaque server sessions, persistent rate limits, one-wedding unique membership, last-ADMIN rule, role permissions, minimal durable account/member email handling, explicit migrations/indexes, audit/version/write-fence conventions and scoped repositories. Follow required draft fields and scheduled publication in API Design. Test two-wedding isolation, membership races, stale saves, reset replay and revocation. Acceptance requires the complete real journey, not mock authentication.

## Phase 2 — Households, websites and RSVP

Manual households, reviewed/retry-safe CSV and supported contact import; explicit invited events/maxGuests; revocable household sessions/links; household preview and private DTOs; one capped household response across invited events, soft shared deadline and conflict handling. Public /w/:slug has explicit snapshot selection, preview/publish/unpublish and separate media authorization. Add manual copy-link sharing for a small family pilot. Test hidden events, count calculations, publication scope and revoke/unpublish behavior.

## Phase 3 — Planning and collaboration

Tasks/checklists/attachments/comments, internal announcements, manual vendors and Google Places discovery, simple actual expenses/receipts/optional budget, Ably saved-change outbox and temporary presence. No booking or payment ledger. Test shared-charge totals, retry identities, provider outages, privacy and concurrent forms.

## Phase 4 — Invitations and messaging

Templates, uploaded images and accessible designer; immutable versions and event-scoped assets; manual WhatsApp with copy/download fallbacks; reviewed Resend campaigns, persisted audience manifests, bounded jobs/retries/callbacks/reminders. Check current access/RSVP before sending; distinguish acceptance/delivery and unknown outcomes. Define cancellation-notice eligibility separately from normal scheduled-event reminders before building that flow.

## Phase 5 — Gallery, livestream and archive

Direct verified uploads, quota reconciliation, authenticated delivery, per-file retry; one shared gallery link/QR for viewing/enabled uploads, also used by photographers; household gallery integration; private external livestream; ADMIN archive with write-fence protection and narrow privacy exceptions. Test rotated/revoked uploads, archive races, gallery-only scope and preserved read access.

## Phase 6 — Integrated validation and launch

Access/security, mobile/accessibility, provider failures, realistic load, duplicate requests/callbacks, job recovery, spending/quotas/alerts, backups plus restore/media recovery, environment isolation and real-family pilot. Define concurrency separately from five weddings/500 people. Select provider plans and measured operating limits before release. Do not describe scaffold checks as launch acceptance.

## Working method

**Audit dependency:** Public cover photos (Phase 2), task attachments/receipts (Phase 3) and uploaded designs (Phase 4) require protected media capabilities currently grouped under Phase 5. Before those items are marked complete, bring the minimal secure media slice forward or explicitly defer their media acceptance. See [Compliance Audit](Wedding-Compliance-Audit.md). This note records an open sequencing dependency; it does not declare those features implemented or remove their scope.

For each phase: choose a complete journey, align contracts/schema/UI, implement only needed directories/dependencies, test meaningful success/failure/access cases, demonstrate, and update the status document with exact evidence and remaining work. Keep existing source documents current; never mark a mocked screen as a completed feature. Commits, pushes and deployments are separate actions.

## Clean implementation requirement

**User requirement:** Keep the project practical, readable and maintainable. Do not accumulate clutter or unfinished work disguised as completed features.

- Create files, folders, components and dependencies only when the current implementation uses them. No empty future-feature directories, unused packages or generated endpoint stubs.
- Keep code small and clearly named, with business rules in their owning modules. Reuse existing code where appropriate; avoid copy-paste implementations and speculative abstraction layers.
- Complete the selected journey through UI, validation, authorization, persistence and meaningful verification. Never return fake success, bypass authentication or silently replace durable data with in-memory state to make a feature appear working.
- Development fixtures and placeholders must be clearly identified and isolated. Remove temporary experiments, debug logging, dead code and unused imports introduced during the task before delivery.
- Follow the approved architecture, database invariants and API contracts. Record conflicts and proposed resolutions rather than adding competing implementations.
- Keep documentation concise and current: what works, evidence, known issues and what remains. Update existing records instead of creating duplicate reports. Preserve useful user material and explicitly labeled historical references.
- Before marking work complete, review the diff for unnecessary changes and run checks appropriate to the change. Tests must verify meaningful behavior, not merely mirror implementation. Do not hide failures with disabled checks or ignored errors.

These rules apply to every phase. They do not remove required security, reliability or accessibility work in the name of simplicity.
