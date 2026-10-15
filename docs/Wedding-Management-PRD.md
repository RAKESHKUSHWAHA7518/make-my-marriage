# Make My Marriage — Product Requirements

**Version:** 3.0
**Updated:** October 15, 2026
**Status:** Approved product baseline; scaffold implementation only.
**Replaces:** v2.2's conflicting roles, RSVP, financial, vendor and contribution-link models. This revision consolidates the earlier screen/flow descriptions around the approved contracts.

The complete previous PRD is preserved in [history](history/Wedding-Management-PRD-v2.2.md) for reference; it is superseded and must not drive implementation.

## 1. Sources and precedence

Latest explicit user decisions take precedence. Use [System Architecture](Wedding-System-Design-Architecture.md) for deployment and technical boundaries, [Database Design](Wedding-Database-Design.md) for structures/invariants, and [API Design](Wedding-API-Design.md) for contracts. This PRD specifies compatible product behavior. See [Decision Record](Wedding-Decision-Record.md) for conflict resolutions and [Implementation Status](Wedding-Implementation-Status.md) for evidence of completed work.

## 2. Purpose and scope

Couples and families plan one wedding together through a responsive, primarily English website. Initial planning scale is about five weddings with 500 expected people each; households, recipients and concurrent users are separate measures. The product is initially free, but provider costs still apply. No launch date or operating budget is assumed.

One shared family workspace contains events, household invitations, tasks/comments/checklists, announcements, vendors, simple expenses, invitation designs, private guest content, an explicitly published public information page, gallery and external livestream links.

## 3. Accounts, memberships and permissions

- Application-owned email/password registration, verification, login/logout and recovery; no Better Auth. Verified email is required before wedding creation or invitation sending.
- One wedding per registered user. Preserve removed membership records; v1 permits reactivation only for that same wedding, not reassignment to another wedding.
- ADMIN and MANAGER are the only roles. Both edit shared planning information, including expenses. No multi-wedding switcher.
- The creator is ADMIN. The partner becomes ADMIN through an invitation accepted by the intended verified email; couple names alone grant no access.
- Only ADMIN issues/revokes family invitations, changes roles, removes members, archives, or rotates the gallery token. Never remove/demote the last active ADMIN.
- Household guests have no account or OTP. Gallery visitors and photographers use shared gallery access, not organizer membership.
- Record safe actor/time/activity information for changes. Check access server-side on every request, including direct API requests.

## 4. Setup, dashboard and navigation

Setup collects couple names, workspace title, timezone and currency; wedding date, introduction, cover photos and overall budget are optional as permitted by the API. Reserve a unique stable public slug without publishing it. Gallery viewing/uploads start disabled until deliberately enabled.

Dashboard: upcoming events/countdown, task status and overdue work, household response counts, projected event attendance, wedding confirmed people, actual spending/optional budget comparison, storage, invitation delivery and recent announcements. Do not show contract balances, payment deadlines or booking status.

Organizer navigation: Dashboard, Events, Guests, Tasks, Vendors, Expenses, Invitations, Announcements, Website, Photos, Members and Settings. Livestream configuration is part of settings. Detail screens support clear empty/loading/error/permission/read-only states.

## 5. Events

Support templates and custom events: haldi, mehendi, sangeet, wedding, reception, pre_wedding, post_wedding and custom. Events contain name/type, start, optional end, venue, description, dress code, optional contact/map, and a bounded simple agenda. Tasks remain separate records.

Follow the API's draft/scheduled/completed/cancelled/removed states. Draft creation requires name, start time and venue name/address; incomplete drafts are deferred unless contracts and validators are explicitly amended. Contact is optional. A versioned transition to scheduled publishes to eligible private invitees; publishing does not send invitations or publish public information.

Households see only currently invited scheduled/completed events. Cancelled/removed events are suppressed from active private/public views. Preserve internal history and prepare eligible event-update/cancellation communication. Cancellation notices need message-type-specific eligibility; do not treat a cancelled event as an ordinary upcoming-event reminder.

## 6. Households and invitations

A household represents a contact and their group, all sharing the same invited events. Store representative/contact details, label, side/tags, internal notes, explicit unique invitedEventIds and organizer-selected maxGuests including the representative. Separate records are needed when relatives require different event access.

Support manual entry, CSV preview/validation and contact import where supported. Contacts may be absent for manual sharing and are not unique. Warn about possible duplicates; never silently merge or discard rows. Review mappings and show per-row results with retry-safe imports.

Household links are private, difficult to guess and revocable. Exchange links for separate HttpOnly capability sessions and redirect to clean URLs. A forwarded link grants its scope until revocation. Do not reveal uninvited events, even as locked cards or metadata.

## 7. One household RSVP

One response/count applies across all of the household's invited events. States: pending, attending, not_attending, maybe. Attending requires a whole-number count 1..maxGuests; other statuses count zero. No adult/child or meal breakdown.

Organizers may record/correct responses using the same validation. Use one optional soft wedding deadline: late responses are accepted and flagged until archive. A household needs at least one eligible invitation to respond.

Changes require the household version. Stale saves return conflict. Lowering maxGuests below an existing attendance requires explicit correction; never truncate it. Changing invited events after a response requires acknowledgement that the same answer applies to the revised list.

Example: invited to Haldi and Wedding, cap 5, answer attending 3. Each event projects 3, while the wedding household total counts 3 once. Summing event totals measures attendances, not unique people; the app cannot deduplicate a person entered in multiple households.

## 8. Private and public wedding websites

Private invitation: couple introduction/cover, eligible invited events, one RSVP, enabled gallery/uploads, private livestream and approved guest contact. Internal notes, other households, membership lists, tasks, expenses and secrets never enter guest DTOs. Save private website content directly through wedding settings; no separate private-site publish state/action is specified in v1.

Public page: /w/:slug on the same application origin. Reserve slugs atomically with collision suffixes, keep them stable, and start unpublished. Organizers explicitly select fields, event summaries, contact and sanitized introduction images, preview, then publish a snapshot. Draft edits do not change that snapshot. Source changes prompt review/republish; cancellation/removal suppresses affected public events immediately.

Public output contains no RSVP, gallery, uploads, livestream, household identity, invitation secrets or planning information. Public media authorization checks the currently published selection. Unpublish denies future page/data/media access, but cannot recall downloaded copies. Start with no-store for wedding publication data/media and noindex for discoverability. No per-wedding deployment, custom domain or anonymous secret-preview link.

## 9. Tasks and family communication

Wedding/event tasks support title, description, assignee, due date, priority, status (todo/in_progress/done/cancelled), bounded checklist, attachments and paginated comments. Filter by event, assignee, status and due date. Template application previews likely duplicates; date changes must not silently move existing deadlines.

Family announcements and task updates remain internal. Both roles can edit shared content with activity recording. No group chat or task dependencies. Ably carries saved-change hints and temporary typing/editing presence without unsaved text. Forms remain unlocked; preserve dirty forms and review conflicting saves. Reconnect/refocus fetches authoritative state.

## 10. Vendors and actual expenses

Manage manual vendor contacts/categories/notes and event associations, or discover through Google Places. Save place IDs and independently authored organizer data; fetch attributed provider details under current caching/storage policy. Discovery failure leaves manual entry and saved notes usable. No vendor accounts, marketplace or automated booking.

Each expense records one actual positive amount, date, category, optional vendor/event, notes and ready family-only receipt assets. Use integer minor units, one wedding currency and retry-safe creation. Shared charges are recorded once without eventId. A later actual expenditure is another expense row. Optional budget remaining = budget minus actual spending.

No separate bookings, estimates/agreed-cost workflow, payment ledger, instalment schedule or contractual outstanding balance. Removal preserves activity/history and excludes the expense from totals. Vendor removal does not erase expenses. Refund/negative accounting is deferred.

## 11. Invitation designs and delivery

Support editable templates, uploaded invitation images and a full drag-and-drop editor with text/images/background/colors/fonts/move/resize plus accessible alternatives. Save bounded validated drafts; publish immutable versions. Editing a draft never changes queued/sent designs. Preview mobile/desktop and permit manual image download.

Every represented event must be authorized for the receiving household; mixed-event cards cannot leak another event. Gallery access grants no invitation-asset permission. Current guest website details remain authoritative even if a downloaded card is old.

WhatsApp is manual: prepare one household's message/link, open WhatsApp, organizer chooses recipient and sends. Provide Copy message/link and optional downloaded image attachment. Record only share opened or organizer marked shared; never infer sent/delivered/read. No WhatsApp API/jobs.

Resend sends account/member emails, reviewed event campaigns and reminders. Show provider acceptance separately from delivery. Persist reviewed audiences and immutable delivery identities, retry with dedupe, verify callbacks, and suppress ineligible/stale messages at send time. Household RSVP reminders stop once that household responds, across all its invited events. Exact reminder timings remain a later configuration decision. Verified sender domain and provider configuration are required before live sending.

## 12. Shared gallery, uploads and livestream

One shared gallery token/link and its QR permit gallery viewing and enabled uploads. Photographers receive the same link. Household invitations also provide gallery access according to current settings. Neither gallery links nor public slugs grant private event, RSVP, livestream, receipt or family access.

ADMIN rotation invalidates old gallery sessions/printed QR links. Disabling uploads preserves viewing; disabling gallery blocks viewing/uploads. Removing a household does not revoke a shared gallery secret it already knows; rotate/disable shared access when required.

Cloudinary stores authenticated originals/derivatives. Upload directly through authorized constrained intents, verify provider facts, recheck current permissions, reserve/finalize quota once, and reconcile failed/late uploads. Show per-file progress/retry; automatically validated photos appear without human moderation. Family may remove unwanted images. Strip location metadata from served derivatives/public copies; private originals need an explicit authorized download.

Formats, storage allowances, HEIC handling, original delivery and provider plan limits need validation before media release. Maintain originals/archive while supported under configured quotas and recovery policy. The gallery is shared: labels must not disclose private event details to unauthorized viewers.

Livestream is an external URL/embed with fallback, available to eligible households. External provider privacy must be configured separately. No native broadcasting.

## 13. Archive and privacy exceptions

ADMIN archives under the wedding write fence. Block ordinary planning edits, comments, RSVP, new uploads/finalization, editing presence and future wedding email dispatch. Preserve authorized family/private/public/gallery reads where enabled.

Narrow ADMIN exceptions: unpublish public content, remove/revoke access, disable gallery or rotate its token. No republication, new membership or enabling uploads after archive. Account recovery and system reconciliation/cleanup remain eligible. No reopening or implicit hard-delete workflow in v1. In-flight external sends/downloads cannot reliably be recalled.

## 14. Quality and acceptance

- Responsive mobile/desktop flows; labeled inputs, focus visibility, keyboard operation, contrast, reduced motion and no autoplay audio. Target review widths: 360, 390, 768 and 1280 pixels.
- Test long/missing values, failure/retry, archived states and concurrent edits. Preserve safe input on recoverable failures.
- No cross-wedding access through pages, direct APIs, assets or realtime channels. No raw secrets in logs, analytics, public HTML or client bundles.
- Shared database transactions protect membership, versions, lifecycle, quota and retry invariants; TTL is cleanup, never authorization.
- Validate two-wedding isolation, last ADMIN, reset replay/session revocation, household cap/RSVP races, shared gallery scope/rotation, public allowlists/unpublish, expense retries, duplicate webhooks, archive races and restore recovery before release.
- Proposed performance targets remain unmeasured: invitation usability about 3 seconds and RSVP acknowledgement about 2 seconds on an agreed mobile setup. Define concurrency separately and measure provider/cold-start behavior.
- Backup/restore and media export/recovery drills, limits, cost alerts, observability and a real-family pilot precede public release.

## 15. Delivery and exclusions

Follow [Development Plan](Wedding-Development-Plan.md): scaffold, identity/workspace/events, households/websites/RSVP, planning, invitations, media/archive, integrated launch validation. Scaffold completion is not feature or security certification.

Excluded: professional planner/multiple-wedding accounts, hotel/transport/seating management, check-in QR, vendor self-service, payments processing, SMS, automated WhatsApp, chat, task dependencies, guest accounts/OTP, public RSVP/gallery/uploads and native streaming. No microservices, separate Express app or persistent background server.

Stitch homepage/login exports are pending. Use their supplied designs when available; do not infer or redesign them. Visual direction is light burgundy, warm, modern, premium and restrained.
