# Onboarding QA — October 23, 2026

Target: `http://localhost:3001`. Manual browser testing, with supplemental existing integration/countdown suites. No application code changed.

Chrome covered validation and a dated USD wedding. Its shared session later changed back to the personal account, so the remaining checks used an isolated in-app browser. Two synthetic accounts were provisioned directly in the development database; only those accounts were marked verified for test setup. This does **not** verify email delivery or the email-link journey. Personal wedding records were not edited.

## Manual results

| ID | Steps | Expected | Actual | Result |
|---|---|---|---|---|
| 01 | Open `/wedding/create` as an existing wedding member. | Block second creation. | “You already have a wedding” and saved-wedding link; no form. | PASS |
| 02 | Sign in to synthetic unverified account; open create route. | Require verification. | “Please verify your email”; no creation form. | PASS |
| 03 | Mark only synthetic account verified as test setup; reload. | Show real onboarding form. | Couple/title/timezone/currency/date/budget fields appeared. | PASS |
| 04 | Submit empty form. | Reject required names/title. | Bride, groom and workspace-name errors; review-details alert. | PASS |
| 05 | Fill couple names. | Suggest editable title. | `QA Mira & QA Dev’s Wedding` suggested. | PASS |
| 06 | Enter custom title; later change a couple name on second test. | Preserve manual title. | `QA Optional Fields Blank` remained unchanged. | PASS |
| 07 | Enter negative budget `-1`; submit. | Reject. | Nonnegative/two-decimal error; no save. | PASS |
| 08 | Enter budget `1.001`; submit. | Reject excessive precision. | Review-details error; form retained; no save. | PASS |
| 09 | Enter valid budget with timezone `Wrong/Zone`; submit. | Reject timezone. | “Choose a valid time zone”; focus moved to timezone. | PASS |
| 10 | Enter budget `92233720368547758.08`; submit. | Reject storage overflow. | “Budget is too large.” | PASS |
| 11 | Correct errors; choose USD, `12345.67`, Asia/Kolkata, date `2027-02-14`, custom title; save. | Save exact values. | Disabled fields and “Creating your wedding…” observed, followed by saved overview. | PASS |
| 12 | Inspect saved overview and reload. | Values persist. | Title, names, USD 12,345.67, timezone and 14 February 2027 persisted; 114-day countdown displayed. | PASS |
| 13 | Inspect initial role and privacy statuses. | Creator ADMIN; private defaults. | Admin, Unpublished, Not enabled, authorized-members privacy notice. | PASS (UI) |
| 14 | Inspect only synthetic wedding persistence. | One membership; exact money. | One membership; budget minor units `1234567`, USD and date matched. | PASS |
| 15 | Return to create route after creation. | No second form. | Existing-wedding gate names the synthetic saved wedding. | PASS |
| 16 | In isolated signed-out session, open `/wedding` and `/wedding/create`, allowing redirects to settle. | Both require login. | Both redirected to `/login`. | PASS |
| 17 | Second verified synthetic account: save required fields only, leaving date undecided and budget empty. | Optional fields accepted. | Saved overview shows Date not decided, Budget not set and no countdown. | PASS |
| 18 | Reload second wedding. | Optional values persist. | Same title, names and unset optional states. | PASS |
| 19 | Mark only second synthetic membership removed; reload overview. | Deny private access. | Wedding access unavailable; retained-account association explained. | PASS |
| 20 | Open create route with removed membership. | No new wedding allowed. | Same access-unavailable gate; no form. | PASS |

## Supplemental checks

- `npm run test:weddings`: **8/8 reported tests passed** (7 cases plus parent), including validation/exact money, unverified and missing-key rollback, same/different-key races, replay conflict, one-wedding invariant, tenant isolation, safe DTOs, removed access, session and mutation-origin checks. Suite uses and drops its own temporary database.
- `npm run test:countdown`: **3/3 passed**, covering wedding timezone calendar days, today/past states, DST/leap dates and missing/invalid dates.

## Diagnostics and limits

Chrome captured a React hydration mismatch listing Grammarly body attributes (`data-new-gr-c-s-check-loaded`, `data-gr-ext-installed`). The isolated browser's inspected warning/error log was empty before the removed-membership test. Extension causation was not independently isolated. Several Chrome inspection/navigation calls timed out or aborted during transitions; settled states were checked before recording passes.

Request-level network traces were unavailable. Forced lost-save-response retries, real transport failure, exact name/title limits, every timezone/currency, invalid calendar input, calendar-day rollover, full accessibility and breakpoint coverage were not exercised manually. No production/provider readiness claim is made. No functional onboarding defect was reproduced in the executed cases.

Both disposable QA accounts and their own weddings, memberships, activity, idempotency and session records were removed. No email was sent. The personal Chrome account session was left untouched after it changed back. Temporary fixture script removed.

Screenshots are retained outside the repository in the task visualization directory: `onboarding-qa-saved-20261023.png` and `onboarding-qa-optional-blank-20261023.png`.
