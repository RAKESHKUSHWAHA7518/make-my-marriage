# Edit wedding details QA — October 23, 2026

Target: `http://localhost:3001`. Manual testing in an isolated in-app browser with a synthetic verified account and private wedding. No email sent or personal wedding records changed. The application initially refused connections; the documented webpack development server was started on port 3001 and left running.

## Browser results

| Test / steps | Expected | Actual | Result |
|---|---|---|---|
| Open overview, select Edit wedding details. | Open prefilled editor. | Names, title, date, timezone, INR and exact budget prefilled at `/wedding/details`. | PASS |
| Clear bride name and title, submit. | Required errors; no save. | Inline errors and focus on bride field; other values preserved. | PASS |
| Change both names, title, date, timezone, currency and budget, then save. | Persist every field. | QA Mira Edited / QA Dev Edited; QA Edited Celebration; 15 February 2027; Europe/London; GBP; 12,345.67 saved. | PASS |
| Observe pending state. | Prevent duplicate submission/edits. | Saving label and disabled controls observed. | PASS (presentation) |
| Inspect overview immediately after save. | Updated values/countdown without manual refresh. | Updated message, all saved fields, and countdown changed from 114 to 115 days. | PASS |
| Reload overview and reopen editor. | Values persist. | Saved values retained and available for editing. | PASS |
| Mark date undecided and empty budget; save. | Clear both optional values. | Date not decided, Budget not set, no countdown. Later new-tab reads and scoped persistence inspection confirmed absence. | PASS |
| Change title then Cancel. | Leave saved title unchanged. | Returned to overview; saved QA Edited Celebration retained. Native-dialog click timed out; separate confirm/dismiss branches were not reliably observed. | PASS (discard outcome only) |
| Open editors A/B from same saved version; save A then different title in B. | Reject stale overwrite. | A saved QA Conflict Winner. B showed conflict message, disabled inputs and Reload latest details. Database still showed winner at version 4. | PASS |
| Attempt Reload latest details after conflict. | Discard stale changes after confirmation and restore latest data. | Browser click/focus inspection timed out and the stale form remained; no active JS dialog was exposed. | INCONCLUSIVE — native confirmation handling not verified |
| Add synthetic expense-existence marker, reopen editor. | Lock currency. | GBP control disabled; expense-lock explanation visible. | PASS |
| With currency locked, change title and set budget to zero. | Ordinary edits still save; zero is valid. | QA Locked Currency Other Edit and GBP 0 saved, currency unchanged. | PASS |
| Open editor, change title, archive only synthetic wedding, submit stale editor. | Reject archived write. | Archived error, frozen fields and reload action; final stored title unchanged. | PASS |
| Open fresh details route after archive. | Read-only saved details. | Archive notice, saved detail list, no editable form or Save button. | PASS |

The expense marker and archive state were provisioned directly for test setup because expense creation and archive actions are not implemented UI features. This does not validate an end-to-end expense/archive workflow.

## Automated verification

Existing `npm run test:weddings` passed **11/11 reported tests** (10 subtests plus parent), including edit schema/optional clearing/zero budget, MANAGER edits, expense currency lock including a soft-removed expense, archive/removal/tenant restrictions and racing edits with exactly one winner. Its isolated temporary database was dropped by the suite.

## Diagnostics, scope and cleanup

The inspected browser warning/error log returned no entries (limit 15). Request-level network traces were not captured; expected rejection behavior was confirmed through UI and scoped persistence reads. No clean-network guarantee is made.

Lost-response Retry, native confirmation accept/dismiss branches, browser-unload protection, keyboard/accessibility audit, all regional choices and full responsive breakpoint coverage remain unverified. The main requested save/clear/conflict/lock/archive outcomes passed; no functional defect was established by the executed checks. Conflict-reload confirmation remains inconclusive rather than marked passing.

Only the synthetic QA account, wedding, membership, sessions, activity, idempotency records and expense marker were removed. Temporary fixture script removed. Application source/dependencies were unchanged by this QA delivery; existing implementation edits were preserved. Documentation records were updated. No commit, push or deployment.

Evidence outside repository in the task visualization directory: `edit-details-saved-20261023.png`, `edit-details-conflict-20261023.png`, `edit-details-archived-20261023.png`.
