# Family invitations and member administration QA — October 23, 2026

Fresh follow-up to the earlier database-blocked attempt. Database access recovered. No application code was changed by this QA. Chrome reached localhost:3001, but had the owner's personal login; state-changing checks used the isolated in-app browser and four synthetic `qa.retry.20261023.*@example.test` accounts. UI files changed during the run; the final dialog checks below used the refreshed dialog-based interface. This is verification of observed behavior, not user approval or production release approval.

## Browser tests

| Test and steps | Expected | Actual | Result |
|---|---|---|---|
| Open localhost:3001 in Chrome | App reachable | Homepage loaded; login redirected to owner's existing account | PASS |
| Sign in synthetic verified ADMIN; follow overview Family & access | Own wedding and real members | Correct QA wedding, ADMIN and MANAGER shown | PASS |
| Submit invitation with blank email, then malformed email | Invalid input prevents invitation | Native validity reported valueMissing/typeMismatch; no invitation created | PASS (earlier form UI) |
| Invite verified recipient as MANAGER | Pending invitation and honest queue status | Success says queued, not delivered; pending row displayed; DB delivery and email job both queued | PASS |
| Invite same email again | Reject duplicate | “There is already a pending invitation for this email.” with View invitations link | PASS (earlier form UI) |
| Open synthetic invitation as wrong signed-in account; Check invitation | Matching email required | “This invitation is for another email. Sign in with the invited address.” | PASS |
| Sign out; sign into invited verified account in second tab; check original invitation | Preview without automatic joining | Wedding title, MANAGER role and explicit Accept invitation button | PASS |
| Click Accept invitation | Join and navigate to wedding | Own QA wedding overview with MANAGER role; history subsequently accepted | PASS |
| Visit Family & access as MANAGER | No invitation history or access controls | Member list only; administrator-management notice | PASS |
| Refresh while signed in | Session persists | Same recipient, role and family list | PASS |
| Sign out with account open in another tab | Other tab loses signed-in UI | Both tabs showed login | PASS |
| ADMIN promotes existing MANAGER | Saved role and controls refresh | ADMIN displayed; sole-ADMIN lock lifted | PASS |
| ADMIN demotes that other ADMIN in current dialog | Saved MANAGER; remaining ADMIN protected | MANAGER displayed; remaining owner labeled Last administrator protected and removal disabled | PASS |
| Open removal dialog; Cancel | Member stays active | Active member remained | PASS |
| Reopen; confirm Remove access | Retain row/history, deny membership | Access removed; controls absent; accepted invitation retained; DB retained all four accounts and removed membership version 2 | PASS |
| Two tabs hold same member version; save role in first, then stale save in second | Reject overwrite and require reload | “This member changed. Reload the latest members before retrying.”; disabled save/select | PASS |
| Click Reload members | Recover latest saved role | MANAGER and sole ADMIN protection displayed | PASS |
| Create second synthetic invitation in latest modal | Queue status and pending history | Pending invitation and success feedback displayed | PASS |
| Revoke dialog Cancel, then reopen and confirm | Cancel preserves pending; confirm revokes | Reopened pending invitation; final row revoked, Email: Not sent | PASS |
| Archive only fixture wedding; refresh family page | Disable invite/role changes; preserve allowed removal | Archived notice, no invite/change-role controls; ADMIN Remove access available except sole ADMIN | PASS |
| Remove other active member from archived fixture | Privacy removal allowed | Member changed to Access removed | PASS |
| Sign in removed recipient; open family route directly | Account retained, wedding access denied | Account login succeeded with retained-wedding notice; family route showed Wedding access unavailable | PASS |

## Fresh automated integration runs

All commands exited 0, with no skipped or failed cases. Tests use isolated databases. Provider delivery is mocked.

| Command | Expected | Actual | Result |
|---|---|---|---|
| `npm run test:invitations` | Invitation invariants survive normal and racing requests | 9 reported tests passed (8 cases plus parent) | PASS |
| `npm run test:members` | Permissions, versions and last ADMIN preserved | 9 reported tests passed (8 cases plus parent) | PASS |
| `npm run test:weddings` | Wedding/family regression invariants hold | 12 reported tests passed (11 cases plus parent) | PASS |

The invitation cases cover atomic queue creation, normalization/duplicate rejection, matching verified email and explicit acceptance, expiry/replacement, revocation and queue cancellation, retained one-wedding membership/reactivation, archived restrictions, racing create/accept/revoke and two-wedding acceptance, authentication/origin checks, and mocked worker suppression of expired/revoked invitations.

Member cases cover last-ADMIN demotion/removal rollback, stale versions, promotion/self-demotion and immediate authorization loss, account/history retention after removal, archived role prohibition/removal exception, foreign members and MANAGER denial, strict payload/credential checks, simultaneous self-demotions and cross-removals, same-target races, no-op history, and HTTP authentication/origin enforcement.

## Errors and limits

- Captured browser error/warning logs were empty on the invitation/member pages, including the final archived view. A full network trace was not available from the browser tool; no claim of exhaustive network inspection.
- Chrome navigation/input timed out on an early tab; a fresh Chrome tab loaded successfully. Earlier native confirmation testing was interrupted because the tool could not expose that dialog. After reconnecting and refreshing the changed UI, the new application dialogs were successfully tested, including cancel and confirm.
- Expiry, unverified-email rejection, one-wedding protection and simultaneous requests were verified through integration tests, not manually reproduced in the final browser UI. Deferred-response/hash-change acceptance behavior was not fault-injected.
- No live email was sent and no worker/scheduler was run. Queue creation/cancellation and mocked delivery passed; real provider delivery/webhooks remain unverified.
- Types, lint and production build were not rerun for this QA-only report. Earlier implementation results retain their original evidence.
- Disposable fixture cleanup completed: four synthetic users and their QA wedding, memberships, sessions, invitations and queued delivery jobs were removed. Personal accounts and weddings were not changed.
- Screenshot: `C:/Users/rk751/.codex/visualizations/2026/10/22/01a16182-cad5-7990-ac79-6510c684eebd/family-lifecycle-qa-final.png`.
