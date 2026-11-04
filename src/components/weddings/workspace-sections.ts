/** Navigation and honest V1 availability; planned destinations are presentation only. */
export const workspaceSections = [
  { key: "overview", label: "Overview", href: "/wedding", icon: "dashboard", planned: false, description: "Your saved wedding and planning space." },
  { key: "events", label: "Events", href: "/wedding/events", icon: "calendar", planned: false, description: "Keep your celebrations, dates, venues and schedules together." },
  { key: "guests", label: "Guests & RSVP", href: "/wedding/guests", icon: "people", planned: false, description: "Organize invitation groups and their celebrations. RSVP responses follow separately." },
  { key: "tasks", label: "Tasks", href: "/wedding/tasks", icon: "checklist", planned: false, description: "Share checklists, assign responsibilities and follow up on the details." },
  { key: "vendors", label: "Vendors", href: "/wedding/vendors", icon: "store", planned: false, description: "Keep manual vendor contacts, notes and event associations together. Google Places discovery follows separately." },
  { key: "expenses", label: "Expenses", href: "/wedding/expenses", icon: "wallet", planned: false, description: "Record actual spending in your wedding currency." },
  { key: "invitations", label: "Invitations", href: "/wedding/invitations", icon: "mail", planned: false, description: "Create private invitation drafts from templates or uploaded images." },
  { key: "announcements", label: "Announcements", href: "/wedding/announcements", icon: "announcement", planned: false, description: "Keep your planning family informed with private shared updates." },
  { key: "website", label: "Website", href: "/wedding/website", icon: "globe", planned: false, description: "Prepare your private website draft and preview. Explicit publication follows separately." },
  { key: "photos", label: "Gallery", href: "/wedding/gallery", icon: "photo", planned: false, description: "Share memories through a gallery link and QR code when gallery access is enabled." },
  { key: "family", label: "Family & access", href: "/wedding/family", icon: "shield", planned: false, description: "See your planning family. Administrators manage invitations and access." },
  { key: "details", label: "Wedding details", href: "/wedding/details", icon: "heart", planned: false, description: "View saved details. Administrators can edit them." },
  { key: "settings", label: "Settings", href: "/wedding/plan/settings", icon: "settings", planned: true, description: "More wedding settings, including livestream links and gallery controls, will follow." },
] as const;

export type WorkspacePage = (typeof workspaceSections)[number]["key"] | "sample";
