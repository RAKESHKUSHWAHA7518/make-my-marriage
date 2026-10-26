# Household invitation and RSVP QA — October 26, 2026

## Environment and result

Tested current copied source in an independent app on localhost:3002, with no copied environment files or provider credentials. A separate installed MongoDB replica set was started on **127.0.0.1:27189**, with workspace-owned disposable data. The browser fixture database used an asserted random `mmm_rsvp_browser_<16 hex>` name. Production-connected port 3001, production records, migrations and environment files were untouched. No application code was changed by this QA.

No blocking application defect was reproduced. Fresh automated checks passed **28 reported tests**. Browser checks below verify the main six requested areas; limitations distinguish service/component evidence from browser evidence.

## Browser matrix

| Steps | Expected | Actual | Result |
|---|---|---|---|
| Sign in synthetic MANAGER, open household detail | Authorized sharing controls | Load/copy/replace controls available | PASS |
| Load link, Copy invitation link | Actual copy succeeds | Copied status; clipboard equals displayed URL | PASS |
| Refresh and load again | Stable URL | Exactly same link | PASS |
| Sign out organizer, open full link | Guest access without account/OTP | Guest invitation opens with no login or OTP | PASS |
| Inspect URL after exchange | Fragment removed | Guest URL contains no fragment secret | PASS |
| Invite assigned scheduled, completed, draft, cancelled and removed events; leave another scheduled event unassigned | Show only assigned eligible events | Only Scheduled Ceremony and Completed Gathering shown | PASS |
| Inspect guest invitation | No contacts/private notes/internal workspace data | Synthetic private contact/phone/notes/workspace title and all hidden event names absent | PASS |
| Submit no selection | Required validation | Choose your response | PASS |
| Attending counts 5, 1.5 and 0 with household max 4 | Reject over-limit/fractional/zero | Whole-number range 1–4 error each time | PASS |
| Enter valid count, navigate back, Keep editing | Protect unsaved input | Discard dialog; entries retained | PASS |
| Save Attending, 3 for two invited events | One shared response, not per-event saves | Receipt with 3 people and both events; database one RSVP audit | PASS |
| Submit after past response deadline | Soft deadline permits response and records lateness | Guest warning; organizer last-response and late flag; stored updatedAfterDeadline=true | PASS |
| Reopen editing using same invitation | Prefill saved response; unchanged save disabled | Attending and count 3 prefilled; Save changes disabled | PASS |
| Sign in synthetic ADMIN; load same household link | Same stable link available | Matches MANAGER's link | PASS |
| Edit count to 2 | Update shared response | Saved household version increments and count becomes 2 | PASS |
| Two tabs loaded old version; save first, then second | Reject overwrite | Stale tab shows invitation-changed error; Save disabled | PASS |
| Reload latest details with explicit discard | Recover authoritative saved version | Reloaded count 2 | PASS |
| Open organizer dashboard | Count each household once across multiple events | 1/2 replies and 2 attending people, not 4 | PASS |
| Choose Not attending | Clear headcount | Count field hidden, receipt Not attending; totals zero | PASS |
| Follow Attending summary filter after nonattendance save | List reflects current status | Attending filter empty; Not attending count 1 | PASS |
| Choose Maybe and save | Editable same-link response with zero count | Maybe receipt; stored attendeeCount 0 | PASS |
| Inspect mobile receipt and form widths | Readable responsive layout, no horizontal overflow | Receipt readable at 390px; form scrollWidth 305/375/753/1265 at 320/390/768/1280px | PASS |
| Replace link dialog, Keep current link | Cancel retains URL | Same URL | PASS |
| Confirm Replace link, reload sharing control | New revocable link | URL changed | PASS |
| Refresh old guest session, then open old full URL | Prior session and old token denied | Invitation unavailable in both cases | PASS |
| Open replacement | Retain household response/history | Invitation opens; saved Maybe receipt available | PASS |
| Archive isolated wedding, refresh guest receipt | Read-only invitation/receipt | Archive notice; Edit response absent | PASS |
| Direct /guest/rsvp after archive | No editable form | Read-only notice and eligible events | PASS |
| Organizer load/copy after archive | Existing link may be copied, replacement prohibited | Same replacement URL; copy succeeds; Replace control absent | PASS |
| Remove isolated household, reopen replacement URL | Removed household inaccessible | Invitation unavailable | PASS |
| Open household with only a draft event | Do not expose draft or offer response | Invitation details unavailable; no event details/RSVP control (observed after archive) | PASS for display |
| Expire second isolated link, refresh its guest session | Expired access denied | Invitation unavailable | PASS |
| Refresh dashboard after removal | Removed household excluded | 0/1 replies, zero attending people, only active Pending household counted | PASS |

## Fresh automated verification

Both commands explicitly received the separate local MongoDB URI. Each integration suite selects/asserts a random disposable database and guards cleanup. Component tests execute the actual form handlers without network requests.

| Command | Result |
|---|---|
| npm run test:rsvp | 13 reported tests passed; zero failures/skips; exit 0 |
| npm run test:guests | 15 reported tests passed; zero failures/skips; exit 0 |

RSVP integration cases cover migration failure/repeatability, encrypted stable links for ADMIN/MANAGER and foreign-tenant denial, safe DTO projection, eligible event filtering, capacity/status/strict schemas, cross-household context rejection, concurrent identical-save deduplication and one audit, changed-body idempotency conflict, stale versions/event revisions, no-eligible-events denial, idempotent rotation and old-session invalidation, expired/removed access, late responses, archive read-only and committed retry replay, household-once totals, trusted origin, separate HttpOnly guest cookie, no-store/no-referrer and logout cookie isolation.

RSVP component cases cover required/count validation, immutable key/body across a lost response followed by HTTP 429 and success, nonattendance zero count and conflict blocking. Household regressions cover scoped persistence, capacity, search/filter/pagination, versions/races, history-preserving removal, archive/credentials/tenant protections, HTTP boundaries and guest-form immutable retry/error behavior.

## Errors and limits

- Initial local page navigations and cold route compilation sometimes timed out in browser control. One organizer link load reached the application's retry error; retry succeeded with the same stable link. Saved-page navigation was sometimes delayed but final receipt states were verified. Server output included destination-stream errors during interrupted dashboard loads. Root cause was not established; these do not prove a deployed-runtime defect.
- Final organizer/guest browser error/warning snapshots were empty. This is not an exhaustive network or error audit. Full browser response tracing was unavailable; server request results and persisted local state supplied supporting evidence.
- Actual browser network-loss/429 retries, production-build response loss, simultaneous link rotation versus RSVP, rapid A/B fragment changes, browser history/refresh discard prompts, formal screen-reader audit and deployed HTTPS Secure-cookie behavior were not fault-injected. Retry/race contracts were verified in integration/component tests; the manual concurrency test used two stale browser tabs.
- No-eligible-events rejection with an active wedding is integration-tested; its browser display check occurred after archive. Full design parity across all eleven Stitch state references is not certified.
- No email, WhatsApp, provider worker or scheduler was invoked. Final local database inspection showed four RSVP audits for four successful edits, two links and zero deliveries. Stale/invalid attempts added no RSVP audit. Final response was Maybe/0; removed household history was retained until QA teardown.
- Application source was unchanged; lint/type/build were not rerun for documentation/helper-only QA. No commit, push or deployment.
- Evidence outside the repository: `C:/Users/rk751/.codex/visualizations/2026/10/22/01a16182-cad5-7990-ac79-6510c684eebd/rsvp-receipt-mobile-20261026.png` and `rsvp-expired-20261026.png`. Viewport override was reset.
- Cleanup completed: stopped the recorded app and loopback MongoDB processes, dropped the exact asserted browser QA database, and removed the temporary source copy, dependency junction, local database files and helper/state/log files. Test-suite disposable databases were also cleaned by their guarded teardown.
