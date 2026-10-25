"use client";
import { useRouter } from "next/navigation";
export function TaskRetry() { const router = useRouter(); return <button className="button button-secondary" type="button" onClick={() => router.refresh()}>Retry</button>; }
