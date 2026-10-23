# Make My Marriage — Project Status

**Last updated:** October 23, 2026 (Asia/Kolkata).

This is our ongoing progress log for major features. Update it whenever a major feature is built or materially changed. Detailed checks, implementation files and technical gates belong in [Implementation Status](Wedding-Implementation-Status.md). Requirements and approved decisions remain governed by the existing product, architecture, database and API documents and the [Decision Record](Wedding-Decision-Record.md).

## Current progress

The scaffold, homepage/logo, accounts and wedding onboarding are implemented. Accounts were user-approved October 22; wedding onboarding and its follow-ups were user-approved October 23. Creation persists a private wedding and creator ADMIN membership; the overview reads saved data. Live email/deployment gates remain pending. Events, family invitations and remaining planning features are future work.

| Major feature | Status | Milestone date |
|---|---|---|
| Project scaffold — Phase 0A | Completed and locally verified; technical gates remain | October 15, 2026 |
| Homepage and logo | Implemented and locally verified; visual approval pending | October 16, 2026 |
| Accounts: registration, login, verification and recovery | Implemented, locally verified and user-approved October 22; live delivery pending | October 21, 2026 |
| Wedding onboarding and saved overview | Implemented, locally tested and user-approved; production gates remain | October 23, 2026 |
| Edit wedding details | Implemented; core browser flows and automated checks passed; confirmation/retry coverage and user approval pending | October 23, 2026 |
| Family & access foundation | Implemented; browser list/access/pagination checks and 12-test suite passed; user approval and invitation mutations pending | October 23, 2026 |

## 4. Wedding onboarding and saved overview

**Family access foundation — October 23:** Added `/wedding/family`, real paginated member lists and ADMIN-only invitation history, plus migration 003 for invitation validation/uniqueness. ADMIN/MANAGER role explanations, own-account marker, removed states and archived read-only presentation use the reviewed Stitch layout without invented people or controls. The expanded suite passes 12 reported tests; types/lint passed. Sending, acceptance, revoke, role changes and removal remain planned. See [foundation evidence](Wedding-Implementation-Status.md#family-access-foundation--october-23-2026).

**Independent family QA — October 23:** Overview navigation, member/history lists, 25+2 pagination with no overlap, independent cursors, ADMIN/MANAGER restrictions, invalid list inputs, archived/empty states, removed access and signed-out redirect passed. Integration suite rerun passed 12/12 reported tests. Synthetic fixtures removed; no personal records changed or mail sent. See [QA evidence and limits](Family-Access-QA-2026-10-23.md). User visual approval remains pending; no invitation-sending or access-mutation completion is claimed.

**Edit-details checkpoint — October 23:** User requested commit and progression to the next increment. Saved as `11f98f8` on dev. No push was requested in that turn. Earlier QA limitations remain recorded.

**Edit wedding details — October 23:** Implemented the next increment at `/wedding/details`, linked from the overview. ADMIN/MANAGER can edit saved names, title, date, timezone, currency and budget; optional date/budget can be cleared. Includes validation, currency lock after recorded expenses, optimistic edit conflicts, Retry, discard confirmation and archived read-only details. Onboarding integration suite now passes 11 reported tests. User acceptance and browser visual QA for this increment remain pending; see [edit evidence](Wedding-Implementation-Status.md#edit-wedding-details--october-23-2026). Family invitations remain planned.

**Independent edit-details QA — October 23:** Core browser save/clear/countdown, conflicting-save protection, expense currency lock and archived read-only/stale-save restrictions passed; 11/11 reported integration tests passed. Cancel preserved saved data. Native confirmation handling left conflict reload inconclusive; lost-response retry and user approval remain pending. Synthetic fixtures removed and personal wedding preserved. See [detailed QA evidence](Edit-Wedding-Details-QA-2026-10-23.md).

**Implemented October 23, 2026:** Exact named Stitch Wedding Onboarding V1 creation/overview references, existing logo and burgundy palette. Editable suggested title, searchable timezone, currency, optional date/budget; validation/saving/retry; verification/existing/removed access gates; overview loading/error states. Atomic wedding and creator ADMIN membership. Public publication and gallery access stay disabled.

**Verification:** Eight reported onboarding tests (seven cases plus parent), 16 account regression tests, types, lint and the alternative-compiler production build passed. Browser creation and desktop/mobile overview were exercised with disposable synthetic data. See [detailed onboarding evidence](Wedding-Implementation-Status.md#wedding-onboarding--october-23-2026), including the default build limitation.

**Visual follow-up — October 23:** The initial delivery used simplified styling and did not finish all seven reference designs. That audit is preserved here. The follow-up implements the desktop/mobile form and overview refinements, inline error/saving/failure presentation, three individual access cards with supplied local imagery, and the overview skeleton/error design. Design-board tabs and technical annotations are not customer screens. Verification evidence and remaining review are recorded in the [visual follow-up](Wedding-Implementation-Status.md#onboarding-visual-follow-up--october-23-2026). User visual approval is still pending.

**User acceptance — October 23:** The user confirmed the delivered features look good and authorized this documentation update, commit and GitHub push. This accepts wedding onboarding, saved overview and the logout/countdown/date-validation follow-ups. Earlier pending-approval statements describe their original checkpoints. Approval does not establish live email or production readiness.

**Remaining:** Production gates, live email and forced lost-save-response browser testing. Next increment: plan explicit family invitations and acceptance. Events, dashboard statistics, publishing and uploads are not complete.

**Independent onboarding QA — October 23:** Twenty manual browser cases passed, including validation, exact saved money, persistence, optional blanks and existing/unverified/removed access gates. Existing onboarding and countdown suites passed 8/8 and 3/3 reported tests. Synthetic data was removed; personal wedding records preserved. See [QA evidence and limits](Onboarding-QA-2026-10-23.md). Chrome captured a Grammarly-attribute hydration mismatch; forced lost-save-response and live-email checks remain pending. This is verification, not user visual approval.

**Logout layout correction — October 23:** Reserved space for the pending label, contained header error feedback and corrected the hover contrast. Browser checks covered pending/failure states and 320–1280px widths; type checking and lint passed. See [logout evidence](Wedding-Implementation-Status.md#logout-layout-correction--october-23-2026).

**Wedding countdown — October 23:** Added days remaining to the saved overview when a date exists, using the wedding timezone. Includes today/past-date states, browser clock refresh and no countdown for an undecided date. Date-boundary tests pass; see [countdown evidence](Wedding-Implementation-Status.md#wedding-countdown--october-23-2026) for verification and remaining review.

**Onboarding date validation correction — October 23:** Incomplete native date entries now show an inline error instead of being silently omitted. Independent browser verification reproduced an empty-value/badInput native entry and confirmed error/focus behavior, complete-date correction, and blank/undecided date handling. No test wedding was created; synthetic account removed. Intentionally blank optional dates and immutable save retries remain supported; lost-response retry was not browser fault-injected. See [validation evidence](Wedding-Implementation-Status.md#onboarding-date-validation-correction--october-23-2026).

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

After onboarding visual review, plan explicit family membership invitations and acceptance. Define ADMIN/MANAGER authorization, matching verified email, retained single-wedding membership, last-ADMIN protection and revoke/remove behavior before collaboration. Validate live email before releasing invitations. Events follow as a separate increment; households/RSVP, planning, public websites, gallery/archive and launch validation follow later.

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
