# Make My Marriage — UI Guidelines

> Account UI checkpoint — October 21, 2026: The supplied Stitch desktop/mobile login exports are implemented using the approved burgundy palette, with matching registration, verification and recovery forms. Homepage account actions now link to these forms. Wedding previews remain illustrative. Actual validation, loading, invalid-link and unavailable-service feedback is present; account visual approval and live email verification remain separate checks.

**Updated:** October 15, 2026. Aligned with approved Architecture, Database Design and API Design. Product requirements: [PRD](Wedding-Management-PRD.md). Implementation evidence: [Status](Wedding-Implementation-Status.md).

## 1. Design authority

Homepage and login exports were retrieved from Stitch project 1860855833908619349. Desktop homepage screen 53576c83cc9d442488e8e3fa29e0ba03 and mobile screen dd40e1ef8a154c0aaebb5b919e17eed2 are the references. The first homepage follows their section order and editorial typography, with the user-confirmed burgundy direction taking precedence over the mixed green project theme. Login remains unimplemented. The new SVG M/rings mark is a first implementation for user review.

Direction: light burgundy, warm, elegant, modern, premium and trustworthy. Responsive desktop/mobile. Avoid excessive flowers, traditional invitation styling in the application shell, script fonts in forms, dense dashboards, distracting motion and images behind critical text. Invitation artwork may have its own optional style.

## 2. Homepage tokens

| Token | Value | Purpose |
|---|---|---|
| Background | #FFFDF9 | Warm ivory |
| Surface | #FFFFFF | Cards/forms |
| Primary | #802B3A | Actions and links |
| Primary hover | #69212E | Interaction |
| Text | #2B2123 | Main content |
| Muted text | #706466 | Supporting content |
| Border | #E9DFE0 | Decorative separation |
| Control border | #817581 | Future input boundaries |
| Success | #246343 | Confirmed |
| Warning | #815400 | Attention |
| Error | #A52B3A | Validation/failures |

Homepage headings use locally bundled Playfair Display; body text uses locally bundled Plus Jakarta Sans. Both include their SIL Open Font License files. Only used visual assets and tokens are implemented. Dense illustrative previews use a smaller scale than ordinary body copy. Body/mobile inputs start at 16px. Use a 4px spacing scale, restrained shadows, roughly 12px card radii and at least 44px primary touch targets.

## 3. Navigation and surfaces

Family desktop: sidebar, wedding identity, title/action, content. Mobile: compact header/drawer; optional bottom navigation only if useful. No wedding switcher. Stack dense information into labeled mobile cards. Keep Dashboard, Events, Guests, Tasks, Vendors, Expenses, Invitations, Announcements, Website, Photos, Members and Settings reachable.

Public /w/:slug: explicitly published couple introduction/photos, date/countdown, selected event/venue/dress guidance and approved contact. No RSVP, gallery, livestream, uploads or private data. Website editor separates Public page and Private invitation with clearly labeled previews. Public content requires preview/publish; private settings save directly under current contracts. Unpublished pages reveal no private details.

Private invitation: welcome → invited eligible events → one household RSVP → enabled gallery/uploads → private livestream → approved contact. Hide absent optional sections and uninvited events entirely; no locked event placeholders.

Shared gallery link/QR: gallery viewing plus uploads when enabled; same scope for photographers. No household RSVP, private events, livestream or receipts. Show view-only/disabled/archived states clearly. Rotation warns that old printed QR links stop working.

## 4. Feature presentation

| Screen | Presentation |
|---|---|
| Dashboard | Useful linked summaries, upcoming events/tasks, actual spending, response counts |
| Events | Date/venue/status, invited households and projected people; overview/guests/tasks/vendors |
| Household | Representative, invited event checkboxes, visible maxGuests, one shared response, private link/history |
| RSVP | One answer for all invited events; attendance input 1..maxGuests, representative included |
| Tasks | List first, filters, checklist/comments, optional board later |
| Vendors | Manual contacts or attributed Google discovery, event associations and organizer notes |
| Expenses | Actual expense entries, receipts, total spent and optional budget; no agreed/paid/outstanding columns |
| Designer | Draft/published distinction, preview, keyboard/touch move/resize alternatives |
| Gallery | Paginated thumbnails, individual upload progress/retry and family management |
| Members | ADMIN/MANAGER only; ADMIN membership controls; protect last ADMIN |
| Archive | Persistent read-only explanation; narrow ADMIN privacy controls remain available |

## 5. Interaction and sharing

Visible field labels, optional markers, nearby errors, preserved valid input, explicit save feedback and duplicate-submit prevention. Warn/review on stale versions; never replace a dirty form on realtime refresh. Use currency labels and wedding timezone. Explain that changing invited events retains the existing shared RSVP after acknowledgement; lowering capacity below attendance needs correction.

Separate Share on WhatsApp from Send email. WhatsApp prepares one message/link and organizer sends externally; display only Share opened or Marked shared by organizer. Copy message/link and downloaded-image fallback. Email distinguishes queued, accepted, delivered, failed and uncertain outcomes where supported.

Confirm consequential archive, cancellation, removal and revocation actions, not every ordinary save. Text/icons accompany status colors. Do not expose provider secrets or implementation setup details in guest-facing flows.

## 6. Required states and verification

Relevant screens need loading, empty, populated, validation failure, request failure, permission denial and archived states. Pending RSVP is not Not attending. Invalid links disclose no private records. Retry failed files without repeating successes. Session expiry guides safe reauthentication. Provider failures do not claim successful sends/saves.

Review 360/390/768/1280px, keyboard/focus/dialog behavior, contrast, long names/addresses, missing images, large text and slow/failed networks. Respect reduced motion; no autoplay audio. Reserve thumbnail space and avoid loading originals in gallery lists. Private content must not appear in unauthorized metadata/previews.

## 7. Remaining design work

Review the implemented homepage and logo; implement the supplied login design with authentication; review remaining organizer/guest/gallery flows; build only used reusable controls; verify accessibility and permission/read-only states. No full UI or business journey is completed by the scaffold.
