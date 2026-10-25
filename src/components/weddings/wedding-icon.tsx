const paths = {
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  dashboard: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8",
  checklist: "m3 6 2 2 4-4M12 6h9M3 13l2 2 4-4m3 2h9M3 20h6m3 0h9",
  wallet: "M3 5h16v4H3V5Zm0 4h18v12H3V9Zm13 4h5v4h-5v-4Z",
  store: "M3 10V4h18v6M2 10h20M4 10v11h16V10M9 21v-7h6v7M8 4v6m8-6v6",
  announcement: "M3 10v6h5l11 5V4L8 10H3Zm5 6 2 6m11-12 2-1m-2 6 2 1",
  photo: "M3 3h18v18H3V3Zm0 15 6-6 4 4 3-3 5 5M15 8h.01",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z",
  menu: "M3 6h18M3 12h18M3 18h18",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  person:
    "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M12 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  calendar:
    "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 14h2m3 0h2m3 0h1M7 17h2m3 0h2",
  lock: "M6 10h12v11H6ZM8 10V6a4 4 0 1 1 8 0v4M12 14v3",
  shield: "m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Zm-4 10 3 3 5-6",
  mail: "M3 5h18v14H3Zm0 0 9 8 9-8",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  back: "M20 12H4m6-6-6 6 6 6",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 3",
  edit: "m15 4 5 5M3 21l5-1L21 7l-5-5L3 15v6Z",
  alert: "M12 3 2 21h20L12 3Zm0 6v5m0 3h.01",
  retry: "M21 10a9 9 0 1 0-2 8M21 3v7h-7",
  cloud: "M7 18a5 5 0 1 1 0-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1-1 11H7Z",
  bookmark: "M6 3h12v18l-6-4-6 4V3Z",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
} as const;
export function WeddingIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="wedding-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
