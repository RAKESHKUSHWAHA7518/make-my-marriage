"use client";
import { useEffect, useState } from "react";
import { daysUntilWedding } from "@/modules/weddings/countdown";
import { WeddingIcon } from "./wedding-icon";

export function WeddingCountdown({
  weddingDate,
  timezone,
  initialDays,
}: {
  weddingDate: string;
  timezone: string;
  initialDays: number | null;
}) {
  const [days, setDays] = useState(initialDays);
  useEffect(() => {
    const update = () =>
      setDays(daysUntilWedding(weddingDate, timezone, new Date()));
    const visible = () => {
      if (document.visibilityState === "visible") update();
    };
    const firstTick = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [weddingDate, timezone]);
  if (days === null) return null;
  return (
    <aside className="wedding-countdown" aria-label="Wedding countdown">
      <WeddingIcon name="heart" />
      <div aria-live="polite" aria-atomic="true">
        {days > 0 ? (
          <>
            <strong>{days.toLocaleString("en-IN")}</strong>
            <span>{days === 1 ? "day to go" : "days to go"}</span>
            <small>Until your wedding</small>
          </>
        ) : days === 0 ? (
          <>
            <strong className="wedding-countdown-message">Today</strong>
            <span>It’s your wedding day</span>
          </>
        ) : (
          <>
            <strong>{Math.abs(days).toLocaleString("en-IN")}</strong>
            <span>
              {days === -1
                ? "day since your wedding date"
                : "days since your wedding date"}
            </span>
          </>
        )}
      </div>
    </aside>
  );
}
