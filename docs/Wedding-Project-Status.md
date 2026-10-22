# Make My Marriage — Project Status

**Last updated:** October 22, 2026 (Asia/Kolkata).

This is our ongoing progress log for major features. Update it whenever a major feature is built or materially changed. Detailed checks, implementation files and technical gates belong in [Implementation Status](Wedding-Implementation-Status.md). Requirements and approved decisions remain governed by the existing product, architecture, database and API documents and the [Decision Record](Wedding-Decision-Record.md).

## Current progress

The scaffold, homepage/logo and account feature are implemented. The user approved the account feature on October 22 after testing and code review. Account integration/security tests and the final browser QA retest pass. Live Resend delivery and deployment gates remain pending. Homepage wedding previews are illustrative; wedding management is still future work.

| Major feature | Status | Milestone date |
|---|---|---|
| Project scaffold — Phase 0A | Completed and locally verified; technical gates remain | October 15, 2026 |
| Homepage and logo | Implemented and locally verified; visual approval pending | October 16, 2026 |
| Accounts: registration, login, verification and recovery | Implemented, locally verified and user-approved October 22; live delivery pending | October 21, 2026 |

## 1. Project scaffold

**Completed October 15, 2026**

- Established the Next.js App Router, TypeScript and npm project in the existing repository root.
- Added styling foundations, local development/build/check commands, environment validation and a credential-free local startup.
- Aligned project documentation and recorded approved architecture, database and API decisions.

**Verification:** Local development and production checks, lint, type checking and build results were recorded on October 15. See [scaffold evidence and outstanding tooling findings](Wedding-Implementation-Status.md).

**Remaining:** Phase 0B provider/runtime feasibility gates, environment isolation, deployment and the documented tooling maintenance findings. A working scaffold does not mean provider integrations or business APIs are complete.

## 2. Homepage and logo

**Implemented October 16, 2026**

- Built the responsive homepage from supplied Stitch references using the confirmed burgundy visual direction.
- Added a custom SVG logo, shared wordmark, favicon, local fonts and marketing photographs.
- Added the hero, family collaboration and product previews, gallery, introduction steps, FAQs and footer.
- Implemented responsive navigation, FAQ interactions and account-availability dialogs.

**Verification:** Lint, type checking and production build passed on October 16. Recorded browser checks covered responsive layouts, navigation, keyboard interactions, dialog focus and loaded assets. See [homepage implementation and verification](Wedding-Implementation-Status.md#homepage-and-logo--october-16-2026).

**Current integration:** Account dialogs have since been replaced by links to the implemented registration/login flows. Wedding product previews remain illustrative. **Remaining:** Separate homepage visual approval and production legal/contact content.

## 3. Accounts

**Implemented October 21, 2026**

- Supplied Stitch login design adapted to burgundy, plus registration, verification/resend and password recovery screens.
- Eight account APIs, Argon2id passwords, opaque cookie sessions, persistent rate limiting, atomic single-use recovery and session revocation.
- Explicit account database migration, encrypted durable email queue, bounded retries and signed Resend callbacks.
- Protected welcome page and logout. Homepage account dialogs have been replaced by links to the real forms.

**Verification:** Final account suite passed 16 reported tests (15 subtests plus parent); the environment-isolation regression test also passed. Lint, type checking and production build passed. Browser QA confirmed signed-in login/signup redirects and cross-tab sign-in/logout in both directions, with no captured hydration or scroll warnings in the clean browser. Code-review fixes cover callback starvation, environment selection and uncertain email submission. Detailed evidence: [Implementation Status](Wedding-Implementation-Status.md#authentication-qa-corrections--october-22-2026).

**User approval — October 22, 2026:** The user confirmed the feature looks good after testing and code review and authorized the repository checkpoint. This approves the delivered account feature; live provider and deployment validation below remain open.

**Remaining:** Resend API key was accepted and the configured sender domain was verified through a read-only provider check on October 22. No email was sent. Live delivery/reset/verification journeys, webhook configuration (secret still missing) and production scheduler remain to be validated. Production runtime/environment/security gates remain. This completes account code, not the entire Phase 1 shared-workspace journey.

## Next useful feature

Next, plan verified-user wedding onboarding: create one wedding, establish its ADMIN membership and show a persisted workspace summary. Confirm the scope before implementation; validate live account emails before releasing the dependent journey. Then add partner invitations and events incrementally. Enforce unique user membership and last-ADMIN rules before collaboration. Households/RSVP, planning, invitations, gallery/archive and launch validation follow later.

## How to maintain this log

- Add an entry when delivering a new major feature; update its existing entry for later improvements and preserve significant milestone dates.
- Record what is completed, what was actually verified and what remains. Keep implementation, verification and user approval distinct.
- Include the date and a link to detailed evidence in Implementation Status. Historical checks retain their original dates; do not imply they were rerun.
- Update the progress table and next useful feature as work advances. Keep detailed technical evidence in Implementation Status and design changes in the appropriate source documents.
- Do not mark mock data, static previews, planned endpoints or untested integrations as completed functionality.

**Log established October 20, 2026:** Seeded from the existing scaffold and homepage records. This documentation update does not represent new application testing or implementation.

**Repository checkpoint October 20, 2026:** The user subsequently requested committing all remaining homepage, asset, documentation and local MCP configuration changes on `dev`. The earlier status-log commit is `2d84ca1`. This checkpoint does not change feature completion or visual approval status; no push or deployment is included.

**Account review corrections — October 22, 2026:** Fixed unmatched email callbacks blocking later receipts and maintenance commands loading the wrong environment. Added passing regression coverage and applied the callback retry index. See Implementation Status for evidence. Live email/deployment gates remain open.

**Authentication QA corrections — October 22, 2026:** Fixed the linked QA report's signed-in login/signup pages and stale cross-tab logout UI. Browser retests passed in both directions, with no captured hydration/scroll warnings in the clean browser. Added lost-email-response coverage; account suite passes 16 reported tests. Full evidence and remaining live-email gates are in Implementation Status.
