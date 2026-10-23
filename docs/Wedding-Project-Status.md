# Make My Marriage — Project Status

**Last updated:** October 24, 2026 (Asia/Kolkata).

This is our ongoing progress log for major features. Update it whenever a major feature is built or materially changed. Detailed checks, implementation files and technical gates belong in [Implementation Status](Wedding-Implementation-Status.md). Requirements and approved decisions remain governed by the existing product, architecture, database and API documents and the [Decision Record](Wedding-Decision-Record.md).

## Current progress

The scaffold, homepage/logo, accounts, wedding onboarding, detail editing and family access code are implemented. Accounts were user-approved October 22; wedding onboarding and its follow-ups were user-approved October 23. Family invitations/acceptance, member role changes/removal, Stitch refinements and ADMIN-only wedding details were user-approved October 24. Recorded lifecycle browser QA and automated tests pass; Resend reports two real invitations delivered. Signed callbacks, retry scheduling, targeted remaining regressions and deployment gates remain pending. Events and remaining planning features are future work.

| Major feature | Status | Milestone date |
|---|---|---|
| Project scaffold — Phase 0A | Completed and locally verified; technical gates remain | October 15, 2026 |
| Homepage and logo | Implemented and locally verified; visual approval pending | October 16, 2026 |
| Accounts: registration, login, verification and recovery | Implemented, locally verified and user-approved October 22; live delivery pending | October 21, 2026 |
| Wedding onboarding and saved overview | Implemented, locally tested and user-approved; production gates remain | October 23, 2026 |
| Edit wedding details | Implemented and user-approved October 24; ADMIN-only editing tested; targeted browser/retry coverage remains | October 23, 2026 |
| Family & access foundation | Implemented and user-approved October 24; browser lists/access and invitation mutations verified | October 23, 2026 |
| Family invitations and acceptance | Implemented and user-approved October 24; lifecycle browser QA passed; two provider-delivered emails confirmed; callback/scheduler gates remain | October 23, 2026 |
| Member roles and removal | Implemented and user-approved October 24; browser role/removal flows and automated permissions/concurrency checks passed | October 23, 2026 |

## 4. Wedding onboarding and saved overview

**User approval and GitHub checkpoint — October 24:** User approved the completed increment and requested commit/push on `dev`: family invitations/acceptance, roles/removal and last-ADMIN safeguards, Stitch presentation fixes, automatic invitation email dispatch and ADMIN-only details editing. [Lifecycle QA](Family-Lifecycle-QA-2026-10-23.md) records browser checks plus 9 invitation, 9 member and 12 wedding tests; the October 24 wedding rerun also passed 12 reported tests. Remaining work is signed callbacks/retry scheduling, production gates, targeted hash-response/permission-view regressions and future planning features. Earlier pending-approval/no-commit statements are historical.

**ADMIN-only wedding details — October 24:** Implemented the user's revised permission: ADMIN edits; MANAGER views saved details without an edit form. Server authorization and the transactional membership fence both require ADMIN. Updated product/API/architecture/database guidance and role descriptions. The wedding suite passed all 12 reported tests, including MANAGER denial with unchanged persisted data and retained read access. See [permission evidence](Wedding-Implementation-Status.md#admin-only-wedding-details--october-24-2026) for verification and remaining checks. Earlier shared-edit records describe the superseded rule.

**Invitation email dispatch correction — October 23:** Found two invitation deliveries queued with zero attempts. Added the missing after-response worker trigger to invitation creation, retaining durable scheduled retries and the existing worker safeguards. Both existing invitations now have completed jobs and Resend reports `delivered`; inbox placement is not proven. Type checking and lint passed; detailed verification and remaining scheduler/callback gates are in [dispatch evidence](Wedding-Implementation-Status.md#invitation-email-dispatch-correction--october-23-2026).

**Stitch layout correction — October 23:** Reworked the workspace header/tabs, edit form/sidebar, family member rows and invitation/member confirmation dialogs from the named MMM V1 Stitch references. Input borders, labels and mobile actions are readable; invitation roles use selectable cards. Desktop/mobile visual and keyboard checks passed without sending invitations or changing access. Types, lint and the production webpack build passed; user visual approval and full mutation/live-email QA remain pending. See [visual verification](Wedding-Implementation-Status.md#workspace-stitch-layout-correction--october-23-2026).

**Overview navigation spacing — October 23:** Grouped account/details/family links in a labelled wrapping navigation row with explicit gaps and consistent icon placement. This corrects the touching/colliding links shown in the user's screenshot. Type checking passed; evidence and verification limits are in [Implementation Status](Wedding-Implementation-Status.md#overview-navigation-spacing--october-23-2026).

**Invitation preview review fix — October 23:** Bound displayed wedding/role, acceptance and feedback to the current fragment token. Responses for a superseded token are ignored, including errors and navigation effects. Type checking passed; detailed verification and browser regression limits are recorded in [Implementation Status](Wedding-Implementation-Status.md#invitation-preview-token-binding--october-23-2026).

**Member administration — October 23:** ADMIN can change active members' roles and remove access, with version checks, activity history and transaction-safe last-active-ADMIN protection. Role changes are blocked after archive; ADMIN removal remains available as a privacy action. Removed memberships/accounts/history are retained, with wedding access denied on subsequent requests. Nine reported member tests and nine invitation regression tests passed; browser QA and user review remain pending. See [member evidence](Wedding-Implementation-Status.md#member-roles-and-removal--october-23-2026). New work remains uncommitted for review.

**Member final checks:** Types, lint and the production webpack build passed. The separate wedding regression could not establish its database connection on either attempt, before cases ran; its previous 12-test pass is historical. Browser confirmations and live email remain review/release gates.

**Independent QA follow-up — October 23:** Connectivity recovered; invitation/member/wedding suites freshly passed 30 reported tests. Browser invitation acceptance, role permissions/changes, conflict recovery, removal/revocation confirmations, retained account/access denial, session behavior and archive controls passed. No application code changed. Live provider delivery and fault-injected acceptance response handling remain open; user approval remains pending. See [QA matrix and limits](Family-Lifecycle-QA-2026-10-23.md).

**Independent invitation/member QA attempt — October 23:** Both invitation/member suites and disposable fixture setup failed at initial database connection, before lifecycle cases or test writes. Standalone ping success was inconsistent with test-process connection failures; cause remains unverified. No new flow pass, live email or personal-data change is claimed. Browser acceptance/confirmations and fresh concurrency verification remain blocked pending restored connectivity; see [detailed attempt](Wedding-Implementation-Status.md#member-roles-and-removal--october-23-2026).

**Family invitations — October 23:** Foundation committed at user request as `4c9c87e` on dev (not pushed). Added ADMIN invitation creation/revocation, durable queued email and a minimal matching-verified-email acceptance journey so emailed links are functional. Includes expiration, duplicate/conflict handling, same-wedding reactivation and one-wedding enforcement. Invitation, wedding and account suites pass 9/12/16 reported tests; production webpack build passes. Browser QA, live email and user acceptance remain pending. Role changes/removal remain planned. See [invitation evidence](Wedding-Implementation-Status.md#family-invitations-and-acceptance--october-23-2026).

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

Review/test the complete family invitation and access-management increment, including browser confirmations and live email before release. Then plan event creation and management as a separate increment; households/RSVP, planning, public websites, gallery/archive and launch validation follow later.

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
