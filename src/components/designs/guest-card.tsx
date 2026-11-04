import { cookies } from "next/headers";
import { householdCookieName } from "@/modules/guest-access/http";
import { guestCard } from "@/modules/designs/guest";
import { DesignCard } from "./design-card";
export async function GuestInvitationCard() {
  let card: Awaited<ReturnType<typeof guestCard>>;
  try {
    card = await guestCard((await cookies()).get(householdCookieName())?.value);
  } catch { return <p className="wedding-notice">The invitation artwork is temporarily unavailable. Your event details and RSVP remain available.</p>; }
  if (!card) return null;
  return <section className="invitation-panel guest-published-card" aria-label="Invitation card"><DesignCard mode={card.mode} draft={card.draft} imageSrc={card.mode === "uploaded_image" ? `/api/v1/guest/card?version=${card.id}&image=1` : undefined} /></section>;
}
