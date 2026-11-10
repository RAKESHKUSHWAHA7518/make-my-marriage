import "server-only";
import { ObjectId, type ClientSession } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { galleryFamilyAccess } from "@/modules/media/access";
import { AccountError, decrypt, origin, privateKey, type Encrypted } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { createDesignSchema } from "@/modules/designs/schema";

const id = z.string().regex(/^[a-f0-9]{24}$/);
const seal = z.string().regex(/^[a-f0-9]{64}$/);
const previewInput = z.strictObject({ householdId: id, designVersionId: id.optional(), expectedReview: seal.optional() });
const markInput = z.strictObject({ householdId: id, expectedReview: seal });
const action = "household.whatsapp_marked_shared";
const unavailable = () => new AccountError(404, "HOUSEHOLD_UNAVAILABLE", "This household is unavailable.");
const changed = () => new AccountError(409, "REVIEW_CHANGED", "The invitation changed. Review it again before sharing.");

function short(text: string) {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, 60).join("");
}

async function prepare(user: User, weddingId: string, householdId: string, session?: ClientSession) {
  const wedding = await galleryFamilyAccess(user, session, !!session);
  if (String(wedding._id) !== weddingId) throw unavailable();
  if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "Sharing is unavailable for archived weddings.");
  const db = await getDatabase();
  const household = await db.collection("households").findOne({
    _id: new ObjectId(householdId), weddingId: wedding._id, status: "active",
  }, { session });
  if (!household) throw unavailable();
  const rows = await db.collection("events").find({
    weddingId: wedding._id, _id: { $in: household.invitedEventIds }, status: { $in: ["scheduled", "completed"] },
  }, { session }).sort({ startsAt: 1, _id: 1 }).toArray();
  if (!rows.length) throw new AccountError(422, "NO_ELIGIBLE_EVENTS", "This household needs at least one eligible invited event.");
  const link = await db.collection("capabilityLinks").findOne({
    weddingId: wedding._id, kind: "household", subjectId: household._id, active: true,
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  }, { session });
  const missingLink = () => new AccountError(422, "LINK_UNAVAILABLE", "Open household details and select Load invitation link to create or renew it.");
  if (!link?.encryptedSecret) throw missingLink();
  let card = null;
  if (household.designVersionId) {
    const version = await db.collection("designVersions").findOne({ _id: household.designVersionId, weddingId: wedding._id }, { session });
    const content = createDesignSchema.safeParse(version?.content);
    const invalidCard = () => new AccountError(422, "CARD_UNAVAILABLE", "The selected card is unavailable or covers events outside this household’s invitation.");
    if (!version || !content.success || !version.eventIds.every((eventId: ObjectId) => rows.some(event => event._id.equals(eventId)))) throw invalidCard();
    for (const assetId of content.data.draft.assetIds) {
      const asset = await db.collection("assets").findOne({
        _id: new ObjectId(assetId), weddingId: wedding._id, purpose: "invitation", visibility: "family", state: "ready",
        audienceEventIds: { $size: version.eventIds.length, ...(version.eventIds.length ? { $all: version.eventIds } : {}) },
      }, { session });
      if (!asset) throw invalidCard();
    }
    card = { id: version._id.toHexString(), revision: version.revision as number, content: content.data };
  }
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: wedding.timezone });
  const events = rows.map(row => ({ id: row._id.toHexString(), name: row.name as string, time: date.format(row.startsAt) }));
  const token = decrypt(link.encryptedSecret as Encrypted, "CAPABILITY_ENCRYPTION_KEY");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw missingLink();
  const url = `${origin()}/invite#token=${token}`;
  const couple = `${short(wedding.couple.brideName)} & ${short(wedding.couple.groomName)}`;
  const representative = household.representative.name as string;
  const message = [
    `Dear ${short(representative)} and family,`,
    `${couple} would love for you to celebrate with us.`,
    ...events.slice(0, 5).map(event => `• ${short(event.name)} · ${event.time} (${wedding.timezone})`),
    events.length > 5 ? "See the invitation for the complete schedule." : "",
    `View your private invitation and RSVP: ${url}`,
    "One response applies to your household.",
  ].filter(Boolean).join("\n\n");
  const review = privateKey(JSON.stringify([
    "whatsapp", weddingId, householdId, household.displayName, representative,
    rows.map(row => [String(row._id), row.version]), String(link._id), link.version, card?.id, message,
  ]));
  const activityId = new ObjectId(privateKey(`whatsapp-shared:${review}`).slice(0, 24));
  return { wedding, household, activityId, preview: { household: household.displayName as string, representative, events, card, url, message, review } };
}

export async function whatsappPreview(user: User, weddingId: string, raw: unknown) {
  const input = previewInput.parse(raw);
  const { preview, activityId, wedding } = await prepare(user, weddingId, input.householdId);
  if ((input.expectedReview && input.expectedReview !== preview.review) ||
      (input.designVersionId && input.designVersionId !== preview.card?.id)) throw changed();
  const db = await getDatabase();
  const existing = await db.collection("activity").findOne({ _id: activityId, weddingId: wedding._id, action });
  return { ...preview, markedAt: existing?.occurredAt.toISOString() as string | undefined };
}

export async function markWhatsappShared(user: User, weddingId: string, raw: unknown) {
  const input = markInput.parse(raw);
  const db = await getDatabase();
  return db.client.withSession(session => session.withTransaction(async () => {
    const { preview, activityId, wedding, household } = await prepare(user, weddingId, input.householdId, session);
    if (input.expectedReview !== preview.review) throw changed();
    const now = new Date();
    const row = await db.collection("activity").findOneAndUpdate(
      { _id: activityId, weddingId: wedding._id, action },
      { $setOnInsert: {
        weddingId: wedding._id, action, actor: { type: "user", userId: user._id },
        entityType: "household", entityId: household._id, summary: "Organizer marked WhatsApp invitation as shared",
        occurredAt: now, createdAt: now, updatedAt: now, schemaVersion: 1,
      } },
      { session, upsert: true, returnDocument: "after" },
    );
    return { markedAt: row!.occurredAt.toISOString() as string };
  }, { writeConcern: { w: "majority" } }));
}
