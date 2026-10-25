/** Navigation and honest V1 availability; planned destinations are presentation only. */
export const workspaceSections = [
  { key: "overview", label: "Overview", href: "/wedding", icon: "dashboard", planned: false, description: "Your saved wedding and planning space." },
  { key: "events", label: "Events", href: "/wedding/events", icon: "calendar", planned: false, description: "Keep your celebrations, dates, venues and schedules together." },
  { key: "guests", label: "Guests & RSVP", href: "/wedding/plan/guests", icon: "people", planned: true, description: "Organize households, choose their invited events and track one RSVP per household." },
  { key: "tasks", label: "Tasks", href: "/wedding/plan/tasks", icon: "checklist", planned: true, description: "Share checklists, assign responsibilities and follow up on the details." },
  { key: "vendors", label: "Vendors", href: "/wedding/plan/vendors", icon: "store", planned: true, description: "Keep vendor contacts and notes together, with Google Places discovery to follow." },
  { key: "expenses", label: "Expenses", href: "/wedding/plan/expenses", icon: "wallet", planned: true, description: "Record actual expenses and receipts in your wedding currency." },
  { key: "invitations", label: "Invitations", href: "/wedding/plan/invitations", icon: "mail", planned: true, description: "Prepare guest invitation designs, email invitations and manual WhatsApp sharing." },
  { key: "announcements", label: "Announcements", href: "/wedding/plan/announcements", icon: "announcement", planned: true, description: "Keep your planning family informed with shared updates." },
  { key: "website", label: "Website", href: "/wedding/plan/website", icon: "globe", planned: true, description: "Prepare private guest content and explicitly choose what to publish publicly." },
  { key: "photos", label: "Photos", href: "/wedding/plan/photos", icon: "photo", planned: true, description: "Share memories through a gallery link and QR code when gallery access is enabled." },
  { key: "family", label: "Family & access", href: "/wedding/family", icon: "shield", planned: false, description: "See your planning family. Administrators manage invitations and access." },
  { key: "details", label: "Wedding details", href: "/wedding/details", icon: "heart", planned: false, description: "View saved details. Administrators can edit them." },
  { key: "settings", label: "Settings", href: "/wedding/plan/settings", icon: "settings", planned: true, description: "More wedding settings, including livestream links and gallery controls, will follow." },
] as const;

export type WorkspacePage = (typeof workspaceSections)[number]["key"] | "sample";
