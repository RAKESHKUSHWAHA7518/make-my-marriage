# Family & access foundation QA — October 23, 2026

Target: `http://localhost:3001`, isolated in-app browser. Synthetic development fixtures: one wedding, 27 member accounts/memberships (including a removed member) and 27 invitation-history records. No email was sent. ADMIN/MANAGER/removed and archived states were prepared directly for test setup; this does not validate invitation issuance, acceptance or access-mutation workflows. Personal wedding data was not changed.

## Browser results

| Steps | Expected | Actual | Result |
|---|---|---|---|
| Open saved wedding overview. | Working Family & access link. | Link opened `/wedding/family`. | PASS |
| Inspect ADMIN family page. | Real names/emails, roles and member statuses. | Fixture names and emails matched; ADMIN/MANAGER explanations and removed/active states shown. | PASS |
| Inspect invitation history as ADMIN. | History with state, role and expiry, no secret tokens. | Pending/accepted/revoked/expired entries and expiry dates displayed. | PASS |
| Seed 27 members and open first page. | Default page size 25. | 25 members displayed with More members. | PASS |
| Select More members. | Remaining 2, no duplicates or missing rows. | 2 rows, 27 unique names across pages, no overlap; current account marked `(You)`. | PASS |
| With member page 2 open, advance invitations. | Invitation page 2 without resetting member pagination. | 2 invitations, 27 unique entries across pages, no overlap; members stayed on page 2. | PASS |
| Select Back to first page. | Return to base family page. | First page restored. | PASS |
| Change only synthetic actor to MANAGER and reload. | Members visible; invitation history hidden. | Member list remained; administrator-only notice replaced invitation section. | PASS |
| As MANAGER directly open invitation-history endpoint. | Access denied. | JSON error `FORBIDDEN`, administrator-only message. | PASS |
| As MANAGER open members endpoint with limit=2. | Member access allowed with bounded safe data. | 2 rows, hasMore=true; inspected JSON contained no passwordHash/tokenHash/credentialVersion/encryptedSecret. | PASS |
| Request member limit=51. | Validation rejection. | `VALIDATION_ERROR`, maximum 50. | PASS |
| Request malformed member cursor. | Reject cursor. | `INVALID_CURSOR` with reload-list guidance. | PASS |
| Restore synthetic ADMIN, remove only synthetic invitations and archive wedding; open family page. | Readable archived list, no mutation controls; clear empty history state. | Archived read-only notice, member list, and No invitations on this page message. | PASS |
| Remove synthetic actor access; reload page and request members endpoint. | Deny both page and API list access. | Access-unavailable gate; endpoint returned `NOT_FOUND`. | PASS |
| Sign out and open family page. | Require sign-in. | Redirected to `/login`. | PASS |

## Automated verification

Reran existing `npm run test:weddings`: **12/12 reported tests passed** (11 subtests plus parent). The family case covers pagination, cursor filter binding, malformed cursors, maximum limits, MANAGER invitation denial, outsider/removed denial, pending-invitation uniqueness (duplicate key 11000), invalid-role rejection (document validation 121), expired filtering, safe projections and archived reads. The suite's isolated temporary database was removed. Broader wedding regression cases also passed.

Types, lint and production build were not rerun for this QA-only delivery; their existing implementation results remain historical evidence.

## Diagnostics and limitations

Scoped inspected browser warning/error log was empty (limit 15). Direct API navigation verified response bodies; no request-level network trace or independent browser HTTP-status capture was collected. Integration assertions establish the expected 403/404 restrictions. A logout click before the access-gate transition settled did not finish navigation; repeating it after observing the settled gate succeeded. No functional foundation defect was reproduced.

Sending, accepting, revoking invitations, changing roles and removing members through product controls remain unimplemented and were not claimed tested. No full accessibility/load/responsive certification, provider-delivery test or production readiness claim. User visual approval remains separate.

Signed out and removed all 27 disposable users plus their own wedding, memberships, invitation records, sessions, activity and idempotency record. Temporary fixture script removed. No application source/dependency changes, commit, push or deployment.

Evidence outside the repository: task visualization `family-qa-pagination-20261023.png` and `family-qa-archived-empty-20261023.png`.
