"use client";
import { useRouter } from "next/navigation";
export function AnnouncementRefresh() { const router = useRouter(); return <button type="button" className="button button-secondary" onClick={() => router.refresh()}>Refresh announcements</button>; }
