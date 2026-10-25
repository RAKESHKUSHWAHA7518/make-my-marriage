# Dashboard QA — October 25, 2026

Read-only testing at localhost:3001 in the existing signed-in Chrome MANAGER session. Local development uses production data. No accounts, fixtures, form submissions, data changes, migrations, mail or database test runs. Application source was not changed. This verifies the workspace foundation, not future planning functionality or deployment readiness.

## Test matrix

| Steps | Expected | Actual | Result |
|---|---|---|---|
| Open /wedding | Saved dashboard and role | Correct wedding overview and MANAGER identity | PASS |
| Compare linked details and overview | Consistent saved values | Couple, date, timezone, currency and budget agree | PASS |
| Check countdown | Correct calendar-day difference | November 11 minus October 25 = 17 days, displayed correctly | PASS |
| Inspect planning cards/timeline/tasks | No fabricated real statistics | Explicit Coming soon messages throughout | PASS |
| Inspect privacy summary | Saved publication/gallery state | Unpublished and Not enabled displayed | PASS (presentation) |
| Inspect desktop navigation | All V1 destinations and active state | 13 destinations; Overview aria-current=page; future sections Soon | PASS |
| Click View wedding details | MANAGER view-only access | Notice, saved values and no edit/save form | PASS |
| Open Family & access | MANAGER sees members without administration | Member list and administrator notice; no invitations/history/mutation controls | PASS |
| Click Events Soon | Correct planned page | Events heading and unavailable message | PASS |
| Click Guests & RSVP Soon | Correct planned page | Guests & RSVP heading and unavailable message | PASS |
| Click Tasks Soon | Correct planned page | Tasks heading and unavailable message | PASS |
| Click Vendors Soon | Correct planned page | Vendors heading and unavailable message | PASS |
| Click Expenses Soon | Correct planned page | Expenses heading and unavailable message | PASS |
| Click Invitations Soon | Distinguish guest/family invitations | Planned guest invitations; explains existing family access separately | PASS |
| Click Announcements Soon | Correct planned page | Announcements heading and unavailable message | PASS |
| Click Website Soon | Correct planned page | Website heading and unavailable message | PASS |
| Click Photos Soon | Correct planned page | Photos heading and unavailable message | PASS |
| Click Settings Soon | Correct planned page | Unavailable additional settings and existing details reference | PASS |
| Click Back to overview | Real dashboard restored | Correct overview | PASS |
| Refresh | Persistent session/workspace | Same role, saved values and countdown | PASS |
| Visit /login while signed in | Dashboard redirect | Final URL /wedding and overview heading | PASS |
| Visit /register while signed in | Dashboard redirect | Final URL /wedding and overview heading | PASS |
| Inspect at 390×844 | Readable mobile layout/navigation | Bottom Overview/Events/Family/More; readable cards, no horizontal overflow | PASS |
| Open More | Labelled navigation drawer | Your workspace dialog, 13 destinations and account link | PASS |
| Escape from drawer | Close and restore focus | Dialog closed; focus on More | PASS |
| Reopen drawer, choose Tasks | Navigate and dismiss | Tasks loaded; drawer hidden | PASS |
| Measure at 320/768/1280px | No horizontal overflow | scrollWidth 305/753/1265, each within viewport | PASS |
| Explore sample workspace | Clear illustrative separation | Explicit unsaved/example banner and Sample data labels | PASS |
| Return from sample | Restore saved workspace | Real overview restored | PASS |
| Open account menu, Your account | Explicit account page accessible | /account with verified welcome and Open your wedding link | PASS |
| Open /wedding in signed-out in-app browser | Protect saved dashboard | Redirect to /login | PASS |

## Errors and limits

Chrome captured one React hydration attribute mismatch naming Grammarly attributes `data-new-gr-c-s-check-loaded` and `data-gr-ext-installed` on body. A development issue badge appeared. This is consistent with extension injection; a dashboard source defect was not established. Signed-out in-app browser error/warning logs were empty. No signed-in extension-free comparison was available.

Browser-control timeouts occurred on an account-menu role selector, full-page screenshot and final account-to-dashboard click. The account menu worked using its accessible label, account navigation was verified, and viewport screenshots succeeded. These tool timeouts are not classified as application failures without user-interaction reproduction.

No application-blocking defect was reproduced in this scope. Full network tracing, slow/offline/error injection, formal accessibility audit, countdown midnight/no-date/past-date variants, fresh credential login, logout/cross-tab changes and ADMIN/archived/removed/unverified/no-wedding variants were not exercised. Those state-changing checks require an explicitly isolated environment. No automated test/build/lint pass is claimed for this documentation-only run.

Responsive override was reset. Evidence outside the repository: `C:/Users/rk751/.codex/visualizations/2026/10/22/01a16182-cad5-7990-ac79-6510c684eebd/dashboard-desktop-20261025.png` (1280×900) and `dashboard-mobile-20261025.png` (390×844).
