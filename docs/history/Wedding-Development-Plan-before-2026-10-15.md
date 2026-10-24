> HISTORICAL REFERENCE ONLY. Superseded on October 15, 2026. Use [the current document](../Wedding-Development-Plan.md) and [Decision Record](../Wedding-Decision-Record.md) for implementation. This snapshot preserves the original planning detail and is not an active requirements source.

# Wedding Platform — Phase-by-Phase Development Plan

**Source:** Detailed PRD v2.2 and Wedding UI Guidelines. All agreed features remain in full-release scope.

No fixed delivery dates are assumed. Estimate each phase after the technology stack, team capacity, and operating budget are known. The design phase expands the PRD's existing development sequence; it does not replace it.

## Phase 0 — Product decisions and UI foundation

**Work**

- Choose organizer authentication, stack, hosting, database, media storage, and email provider.
- Finalize owner-only administrative actions, default timezone/currency, RSVP deadline behavior, and upload limits.
- Produce core mobile/desktop wireframes and reusable UI components using the UI guide.
- Define the wedding/household/event data model and access rules.
- Prepare sample data for multiple households, different event invitations, vendors, payments, and photos.

**Done when:** Core user journeys are reviewable, pending decisions that block coding are resolved, and the same household/event concepts appear consistently in the UI and data model.

## Phase 1 — Accounts, family workspace, and events

**Work**

- Registration, login, account recovery, and protected sessions.
- Wedding creation and partner/family membership invitations.
- One wedding per organizer and shared family editing.
- Event templates, custom events, drafts, publication, and cancellation structure.
- Workspace navigation, initial dashboard, activity history, and responsive shell.

**Done when:** A couple and a family member can join the same wedding and edit an event. Another wedding's records remain inaccessible. Returning users reach their existing workspace.

**Dependency:** Phase 0 authentication and data model decisions.

## Phase 2 — Households, private website, and RSVP

**Work**

- Manual household entry, tags, CSV preview/validation, and contact import where supported.
- Explicit event invitations and revocable household links.
- Private guest website, household-specific event display, and preview-as-household.
- Separate public, view-only wedding page at the shared Vercel origin under /w/:slug, with automatic slug reservation and collision suffixes, explicit content/event/photo selection, preview, publish, and unpublish controls. No public RSVP or uploads; no per-wedding deployment or custom domain.
- Per-event RSVP, unrestricted positive attendance totals, manual organizer response entry.
- Dashboard invitation and attendance metrics.
- Basic Copy link/manual sharing so families can pilot the guest journey before the full invitation designer is complete.

**Done when:** A household invited to wedding/reception cannot access haldi, including through direct API requests. Four attendees at one event and two at another remain separate event counts. RSVP works on phones without login.

**Additional completion check:** Anonymous public-page requests expose only selected public details. Public links never grant private invitation, RSVP, gallery, or upload access; unpublishing removes public access.

**Pilot checkpoint:** Test with a small set of real households. Record problems and fix blockers before expanding invitations.

**Dependency:** Phase 1 membership and event publication.

## Phase 3 — Tasks, vendors, and finances

**Work**

- Wedding/event tasks, assignments, deadlines, checklist templates, attachments, and comments.
- Internal announcements and in-app updates.
- Vendor contacts, categories, service bookings, coordinators, and arrival details.
- Expenses, optional overall budget, partial payment records, receipts, and outstanding balances.
- Connect vendor payment summaries to expense records and complete dashboard planning summaries.

**Done when:** Families can coordinate a mehendi provider and Pandit Ji, assign tasks, and track advance payments. One package covering multiple events is counted only once. All family members can edit these records.

**Dependency:** Phase 1 workspace/events; Phase 2 is not required for every task but is needed for an integrated pilot.

## Phase 4 — Invitation designer and messaging

**Work**

- Editable templates, invitation image uploads, and full drag-and-drop editor.
- Draft/published versions, mobile/desktop previews, and optional design download for manual attachment.
- Share on WhatsApp with the correct household link and copy fallbacks.
- Automated email invitations, provider status handling, failed-send retries, and duplicate-send protection.
- Automatic email reminders, manual WhatsApp reminder actions, event-change/cancellation messages.

**Done when:** Organizers can use all three design modes, share WhatsApp invitations manually, and send email through the configured provider. Opening WhatsApp never appears as verified delivery. Reminder eligibility is checked again at send time.

**Dependency:** Phase 2 household links and event access; configured email provider for live sending. No WhatsApp Business API is needed.

## Phase 5 — Photos, venue QR, livestream, and archive

**Work**

- Shared gallery, thumbnail processing, file validation, per-file upload progress, and retries.
- Guest phone uploads through private invitation links.
- Separate upload-only venue QR generation/download, revocation, and regeneration.
- Photographer contribution links.
- External livestream link/embed with fallback viewing action.
- Owner archive flow and read-only behavior across every module and background job.

**Done when:** Both guest upload paths work without login, and the venue QR cannot expose RSVP or gallery access. Archived weddings reject edits/uploads and suppress pending application-controlled email sends. Authorized viewing remains available.

**Dependency:** Phase 2 guest access; upload/storage decisions from Phase 0; Phase 4 jobs must honor archive state.

## Phase 6 — Integrated testing and launch

**Work**

- Run the PRD's end-to-end acceptance scenarios across organizer, guest, and upload-only access.
- Test mobile layouts, accessibility, long/missing data, failed networks, concurrent edits, and invalid links.
- Test email failures, upload retries, duplicate requests, revoked links, and archive races.
- Verify financial totals, backup restoration, error reporting, and data isolation.
- Test realistic data for approximately 5 weddings with 500 expected guests each; define peak concurrency separately.
- Finalize storage/retention rules and operating limits.
- Complete a real-family trial, fix blockers, and then enable broader public onboarding.

**Done when:** No unresolved access leaks, financial inconsistencies, or blockers in core organizer/guest flows remain; all agreed features pass their acceptance checks. Record any non-blocking issues explicitly.

## Delivery sequence

```text
Phase 0: Decisions and design
    ↓
Phase 1: Family workspace and events
    ↓
Phase 2: Guests, private website, RSVP → Small real-family pilot
    ↓
Phase 3: Tasks, vendors, expenses
    ↓
Phase 4: Full designer, manual WhatsApp, automated email
    ↓
Phase 5: Gallery, QR uploads, livestream, archive
    ↓
Phase 6: Integrated validation and public release
```

## Working method for every phase

1. Pick a complete user journey and its acceptance criteria.
2. Implement its UI, validation, persistence, and access control together.
3. Test the successful path and meaningful failure/access cases.
4. Demonstrate with sample or pilot data and address feedback.
5. Update the implementation checklist and document unresolved decisions.

A visually complete screen with mock data is not a completed feature. Conversely, the pilot should not wait for every decorative detail once its essential workflows and access checks are ready.

## Start here

Begin with Phase 0, then implement this first vertical slice: sign up → create wedding → invite partner → create event → open shared dashboard. Continue with add household → private invitation → RSVP. This establishes the central product flow before adding the full designer and media features.
