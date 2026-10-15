# Wedding Platform — UI Guidelines

**Status:** Proposed design direction for PRD v2.2. Colors and typography are recommendations, not a final approved brand.

## 1. Design direction

Create a warm, elegant wedding experience that stays easy to read and use. The family workspace should emphasize clear information and actions. The private guest website can be more celebratory, with couple photos and invitation styling.

Avoid decorative fonts for forms, dense dashboards, excessive animation, and background images behind important text.

## 2. Suggested visual system

| Token | Suggested value | Use |
|---|---|---|
| Page background | `#FAF7F2` | Warm ivory background. |
| Surface | `#FFFFFF` | Cards, dialogs, forms. |
| Primary | `#74354B` | Main buttons, active navigation, links. |
| Primary hover | `#592638` | Hover/pressed treatment. |
| Main text | `#252329` | Headings and body. |
| Secondary text | `#625C65` | Supporting information. |
| Decorative gold | `#B08D57` | Small accents; not default text or button background. |
| Border | `#DDD5DB` | Decorative separation; interactive controls need a stronger visible boundary. |
| Control border | `#817581` | Inputs and controls; verify contrast in final combinations. |
| Success | `#246343` | Completed, confirmed. |
| Warning | `#815400` | Pending or due soon. |
| Error | `#A52B3A` | Validation and failures. |

Use status text/icons as well as color. Verify final text contrast and control visibility; suggested colors alone do not constitute an accessibility audit.

**Typography:** Use a readable sans-serif such as a system font stack for the workspace. An optional serif heading font can be used on the guest website. Body text and mobile form inputs start at 16px; supporting labels should remain legible. Avoid script fonts except in optional invitation artwork.

**Spacing:** Use a consistent 4px scale: 4, 8, 12, 16, 24, 32, 48. Prefer 16–24px card padding, 12px card radius, and restrained shadows. Use approximately 44px minimum touch targets for primary mobile controls.

## 3. Layout and navigation

### Family workspace

- Desktop: left navigation, page title and primary action, then page content.
- Mobile: compact header and navigation drawer; optional bottom navigation for Dashboard, Events, Guests, Tasks, and More.
- Keep Vendors, Expenses, Invitations, Gallery, Announcements, and Settings accessible from navigation.
- Display wedding identity so users understand their current workspace. Do not add a multi-wedding switcher.
- Stack cards on narrow screens. Convert dense tables into labeled cards or prioritized columns instead of forcing page-wide horizontal scrolling.

### Public wedding information page

Provide a separate `/w/:slug` page with a couple-photo hero, introduction, countdown, explicitly public event cards, venue maps, dress codes, and approved contact details. Use the same visual theme as the invitation site, but no RSVP, Upload Photos, gallery, livestream, or planning actions. Do not show hidden-event placeholders.

The Website editor has separate **Public page** and **Private invitation** tabs, clearly labeled preview modes, event/field/photo selection, Publish, Copy public link, and Unpublish. Public status must be obvious. No household invitation secret is included in the public URL, HTML, metadata, or share preview.

Show an unavailable page for an unpublished URL without disclosing the wedding's private information. Explicitly selected couple images may be shown publicly; shared gallery images are not public by default.

### Private guest website

Use this order: couple/welcome → invited events → RSVP → gallery/upload → livestream → contact details. Hide optional sections with no content instead of showing broken placeholders.

Only render invited events. Never show locked cards or names of uninvited events. Internal planning information must not be present in the guest data response.

### Venue QR upload page

Show wedding identity, a short upload instruction, Choose photos, selected files, and results. Do not provide navigation to household invitations, RSVP, or gallery. Include a clear unavailable state when the link is disabled or the wedding is archived.

## 4. Screen-specific patterns

| Screen | Recommended presentation |
|---|---|
| Dashboard | Four to six summary cards, then upcoming events, urgent tasks, due payments, and pending vendor confirmations. Link every count to its detailed list. |
| Events | Event cards with date, location, status, household invitation count, and confirmed people count. Event detail tabs: Overview, Guests, Tasks, Vendors. |
| Guests | Search, event/tag filters, Add household, Import CSV. Clearly label household invitations separately from people attending. |
| Household detail | Representative/contact details, invited-event checkboxes, RSVP per event, private link, email history, manual WhatsApp actions. |
| RSVP | One event card at a time with Attending / Not attending / Maybe. Show total count only for Attending. Clearly confirm saved values. |
| Tasks | List view first, optional board. Display title, assignee, due date, event, and status. Open task details without losing list filters. |
| Vendors | Provider list with category and contact, plus bookings grouped by event. Show coordinator, arrival time, and booking status. |
| Expenses | Separate Agreed cost, Paid, and Outstanding. Show shared event packages once; distinguish estimates from agreed costs. |
| Invitation designer | Canvas with element toolbar; on mobile use a bottom panel and explicit move/resize controls. Include draft state, save, preview, and publish. |
| Gallery | Responsive thumbnails, Upload photos, and family-only management actions. Individual progress and retry for each file. |
| Archive | Persistent read-only banner; preserve navigation and viewing while disabling edits with an explanation. |

## 5. Forms and interaction

- Place visible labels above inputs; do not use placeholder text as the only label.
- Mark optional fields; keep required fields limited to what the action needs.
- Show errors beside the affected field and preserve valid input after failures.
- Prevent duplicate submissions while saving. Confirm success only after the save succeeds.
- Keep RSVP, booking status, payment status, and email delivery status visually distinct.
- Use explicit actions: Add household, Record payment, Publish event, Share on WhatsApp.
- Use confirmation for archive, cancellation, link revocation, and removal actions that affect others. Do not add confirmation to every ordinary save.
- On conflicting edits, explain what changed and offer reload/review rather than silently overwriting newer information.
- Show a currency label and the wedding timezone where relevant.

## 6. WhatsApp and email presentation

Use separate buttons: **Share on WhatsApp** and **Send email**.

WhatsApp flow: choose household → preview text/private link → open WhatsApp → organizer sends there. Do not show Sent, Delivered, or Read based on opening WhatsApp. Use **Share opened** or **Marked shared by organizer** if recording activity. Provide Copy message and Copy link fallbacks.

Email supports actual send status and provider-reported delivery where available. Label provider acceptance separately from confirmed delivery. WhatsApp reminders are manual actions; email reminders can be scheduled.

## 7. Required interface states

Every relevant screen needs loading, empty, populated, validation-error, request-failure, permission-denied, and archived/read-only states.

Examples:

- Empty events: “Add your first event” with template choices.
- No RSVP: “No response yet,” not “Not attending.”
- Invalid invitation: explain the link is unavailable without revealing private details.
- Failed upload: identify the file and provide Retry; preserve successful uploads.
- Email unavailable: show setup/contact problem and manual sharing alternatives.
- Expired session: sign in again without losing safe draft input where practical.

## 8. Responsive and accessibility checks

- Review layouts at 360px, 390px, 768px, and 1280px widths; choose breakpoints based on content.
- Test keyboard navigation, visible focus, field labels, error announcements, and dialog focus behavior.
- Do not encode meaning only with color, hover, dragging, or animation.
- Respect reduced-motion preferences; avoid autoplay audio.
- Test long names, large attendance counts, missing photos, long venue addresses, and large text settings.
- Keep private content out of previews shown to unauthorized visitors.
- Compress thumbnails and reserve image space to reduce layout jumps.

## 9. Design deliverables before full implementation

1. Navigation map and low-fidelity wireframes for the key organizer and guest flows.
2. Reusable tokens and components: buttons, fields, cards, dialogs, tabs, tables, status badges, file upload, and empty states.
3. Mobile and desktop designs for Dashboard, Event detail, Household detail, RSVP, Vendors, Expenses, invitation editor, gallery, and venue upload.
4. Clickable walkthrough of create wedding → add event → invite household → RSVP, plus both photo-upload routes.
5. A review against the access rules and acceptance scenarios in the PRD.

Keep the first design review focused on these journeys before refining decorative details.
