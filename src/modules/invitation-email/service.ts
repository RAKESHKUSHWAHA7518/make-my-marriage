import "server-only";
import { ObjectId, type ClientSession, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { galleryFamilyAccess } from "@/modules/media/access";
import { AccountError, decrypt, digest, encrypt, mailConfiguration, origin, privateKey, type Encrypted } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { invitationBody, invitationMessage, type InvitationEmailSnapshot } from "./message";

const id = z.string().regex(/^[a-f0-9]{24}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const createSchema = z.strictObject({
  kind: z.literal("invitation"),
  householdIds: z.array(id).length(1),
  eventIds: z.array(id).min(1).max(100),
  designVersionId: id.optional(),
  expectedReviewHash: hash,
});
const missing = () => new AccountError(404, "INVITATION_EMAIL_UNAVAILABLE", "Invitation email unavailable.");
const archived = () => new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Email history is read-only.");

async function access(user: User, weddingId: string, session?: ClientSession) {
  const wedding = await galleryFamilyAccess(user, session, !!session);
  if (wedding._id.toString() !== weddingId) throw missing();
  return wedding;
}

export function guestEmailProcessingEnabled() {
  if (process.env.GUEST_INVITATION_EMAIL_ENABLED !== "true" || (process.env.CRON_SECRET?.length ?? 0) < 32 || !process.env.RESEND_WEBHOOK_SECRET) return false;
  try {
    mailConfiguration();
    return true;
  } catch {
    return false;
  }
}

async function storageReady() {
  const db = await getDatabase();
  const info = await db.listCollections({ name: "emailCampaigns" }, { nameOnly: false }).next();
  return !!info?.options?.validator && (await db.collection("emailCampaigns").indexes()).some(index => index.name === "invitation_email_review" && index.unique);
}

async function review(wedding: Document, householdId: string, session?: ClientSession) {
  if (!id.safeParse(householdId).success) throw missing();
  const db = await getDatabase();
  const household = await db.collection("households").findOne({ _id: new ObjectId(householdId), weddingId: wedding._id, status: "active" }, { session });
  if (!household) throw missing();
  const events = await db.collection("events").find({
    weddingId: wedding._id, _id: { $in: household.invitedEventIds }, status: { $in: ["scheduled", "completed"] },
  }, { session }).sort({ startsAt: 1, _id: 1 }).toArray();
  const link = await db.collection("capabilityLinks").findOne({
    weddingId: wedding._id, kind: "household", subjectId: household._id, active: true,
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  }, { session });
  const card = household.designVersionId
    ? await db.collection("designVersions").findOne({ _id: household.designVersionId, weddingId: wedding._id }, { session })
    : null;
  let cardReady = !household.designVersionId;
  if (card && card.eventIds.every((eventId: ObjectId) => events.some(event => event._id.equals(eventId)))) {
    cardReady = true;
    for (const assetId of card.content.draft.assetIds) {
      const image = await db.collection("assets").findOne({
        _id: new ObjectId(assetId), weddingId: wedding._id, purpose: "invitation", visibility: "family", state: "ready",
        audienceEventIds: { $size: card.eventIds.length, ...(card.eventIds.length ? { $all: card.eventIds } : {}) },
      }, { session });
      if (!image) cardReady = false;
    }
  }
  const address = (household.representative.email ?? "") as string;
  const couple = `${wedding.couple.brideName} & ${wedding.couple.groomName}`;
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: wedding.timezone });
  const snapshot: InvitationEmailSnapshot = {
    household: household.displayName,
    recipient: household.representative.name,
    address,
    couple,
    subject: `Wedding invitation from ${couple.replace(/[\r\n\u0000-\u001f]/g, " ")}`,
    greeting: `Dear ${household.representative.name} and family,`,
    body: invitationBody,
    events: events.map(event => ({ name: event.name, time: `${date.format(event.startsAt)} (${wedding.timezone})`, venue: event.venue.name })),
    card: card ? { name: card.content.name, revision: card.revision } : null,
  };
  const eventIds = events.map(event => event._id.toHexString());
  const designVersionId = card?._id.toHexString();
  const reviewHash = privateKey(JSON.stringify([
    String(wedding._id), householdId, snapshot, designVersionId ?? null,
    events.map(event => [String(event._id), event.version]), link ? [String(link._id), link.version] : null,
  ]));
  const issues = [];
  if (wedding.state !== "active") issues.push("This wedding is archived. Email history is read-only.");
  if (!z.email().max(254).safeParse(address).success) issues.push("Add a valid email address in guest details.");
  if (!events.length) issues.push("This household needs at least one eligible invited event.");
  if (!link?.encryptedSecret) issues.push("Create the household’s invitation link from guest details first.");
  if (!cardReady) issues.push("The selected card is unavailable or covers events outside this household’s invitation.");
  return { snapshot, eventIds, designVersionId, reviewHash, issues, link };
}

export async function reviewInvitationEmail(user: User, weddingId: string, householdId: string) {
  const wedding = await access(user, weddingId);
  const { snapshot, eventIds, designVersionId, reviewHash, issues } = await review(wedding, householdId);
  if (!guestEmailProcessingEnabled() || !await storageReady()) issues.push("Invitation email sending is not available in this environment.");
  return { snapshot, eventIds, designVersionId, reviewHash, issues };
}

export async function queueInvitationEmail(user: User, weddingId: string, raw: unknown, key: string | null) {
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid submission key is required.");
  const input = createSchema.parse(raw);
  await access(user, weddingId);
  if (!await storageReady()) throw new AccountError(503, "EMAIL_UNAVAILABLE", "Invitation email sending is unavailable.");
  const db = await getDatabase();
  const householdId = new ObjectId(input.householdIds[0]);
  const operationKey = digest(`${user._id}:${key}`);
  return db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await access(user, weddingId, session);
    const scope = { weddingId: wedding._id };
    const prior = await db.collection("emailCampaigns").findOne({ ...scope, operationKey }, { session });
    if (prior) {
      if (!prior.householdId.equals(householdId) || prior.reviewHash !== input.expectedReviewHash ||
        JSON.stringify(prior.eventIds.map(String)) !== JSON.stringify(input.eventIds) ||
        prior.designVersionId?.toString() !== input.designVersionId)
        throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This submission key belongs to a different review.");
      return { campaignId: String(prior._id) };
    }
    if (wedding.state !== "active") throw archived();
    if (!guestEmailProcessingEnabled()) throw new AccountError(503, "EMAIL_UNAVAILABLE", "Invitation email sending is unavailable.");
    const current = await review(wedding, String(householdId), session);
    if (current.reviewHash !== input.expectedReviewHash || JSON.stringify(current.eventIds) !== JSON.stringify(input.eventIds) ||
      current.designVersionId !== input.designVersionId)
      throw new AccountError(409, "REVIEW_CHANGED", "The invitation details changed. Reload and review them again.");
    if (current.issues.length) throw new AccountError(422, "INVITATION_NOT_READY", current.issues[0]);
    const previous = await db.collection("emailCampaigns").findOne({ ...scope, householdId, reviewHash: current.reviewHash }, { session });
    if (previous) throw new AccountError(409, "EMAIL_ALREADY_REQUESTED", "An email was already requested for these details. Open invitation email history to check its status.");
    const recipientKey = privateKey(current.snapshot.address.toLowerCase());
    if (await db.collection("deliveries").findOne({ recipientKey, $or: [{ bouncedAt: { $exists: true } }, { complainedAt: { $exists: true } }] }, { session }))
      throw new AccountError(422, "RECIPIENT_SUPPRESSED", "This address cannot receive invitation emails. Review the household’s contact details.");
    const token = decrypt(current.link!.encryptedSecret as Encrypted, "CAPABILITY_ENCRYPTION_KEY");
    const link = `${origin()}/invite#token=${token}`;
    const payload = JSON.stringify(invitationMessage(current.snapshot, link, mailConfiguration().from));
    const now = new Date();
    const common = { schemaVersion: 1, createdAt: now, updatedAt: now };
    const campaignId = new ObjectId();
    const deliveryId = new ObjectId();
    const dedupeKey = `guest-invitation/${campaignId}`;
    await db.collection("emailCampaigns").insertOne({
      _id: campaignId, ...scope, kind: "invitation", householdId, audienceHouseholdIds: [householdId],
      eventIds: current.eventIds.map(value => new ObjectId(value)),
      ...(current.designVersionId ? { designVersionId: new ObjectId(current.designVersionId) } : {}),
      reviewHash: current.reviewHash, operationKey, createdBy: user._id, credentialVersion: user.credentialVersion,
      deliveryId, snapshotEncrypted: encrypt(JSON.stringify(current.snapshot)), version: 1, ...common,
    }, { session });
    await db.collection("deliveries").insertOne({
      _id: deliveryId, ...scope, campaignId, householdId, userId: user._id, kind: "guest_invitation",
      recipientKey, payloadHash: digest(payload), payloadEncrypted: encrypt(payload), dedupeKey,
      payloadExpiresAt: new Date(now.getTime() + 3600000), submissionState: "queued", version: 1, ...common,
    }, { session });
    await db.collection("jobs").insertOne({
      kind: "guest_invitation_send", dedupeKey, payloadRef: { deliveryId },
      state: "queued", runAt: now, attempts: 0, maxAttempts: 4, ...common,
    }, { session });
    await db.collection("activity").insertOne({
      ...scope, ...common, actor: { type: "user", userId: user._id }, action: "household.invitation_email_queued",
      entityType: "household", entityId: householdId, summary: "Household invitation email queued", occurredAt: now,
    }, { session });
    return { campaignId: String(campaignId) };
  }, { writeConcern: { w: "majority" } }));
}

/** Serialize cancellation, household changes and permission changes up to the provider handoff. */
export async function claimInvitationHandoff(delivery: Document, jobId: ObjectId, leaseOwner: string) {
  const db = await getDatabase();
  return db.client.withSession(session => session.withTransaction(async () => {
    const now = new Date();
    const job = await db.collection("jobs").findOne({ _id: jobId, state: "running", leaseOwner, leaseUntil: { $gt: now } }, { session });
    if (!job) return false;
    const campaign = await db.collection("emailCampaigns").findOne({
      _id: delivery.campaignId, weddingId: delivery.weddingId, deliveryId: delivery._id,
    }, { session });
    if (!campaign) return false;
    const user = await db.collection<User>("users").findOne({ _id: campaign.createdBy, credentialVersion: campaign.credentialVersion, status: "active" }, { session });
    if (!user) return false;
    try {
      const wedding = await access(user, String(campaign.weddingId), session);
      if (wedding.state !== "active") return false;
      const current = await review(wedding, String(campaign.householdId), session);
      if (current.issues.length || current.reviewHash !== campaign.reviewHash) return false;
    } catch (error) {
      if (error instanceof AccountError) return false;
      throw error;
    }
    if (await db.collection("deliveries").findOne({
      recipientKey: delivery.recipientKey, $or: [{ bouncedAt: { $exists: true } }, { complainedAt: { $exists: true } }],
    }, { session })) return false;
    const result = await db.collection("deliveries").updateOne({
      _id: delivery._id, submissionState: { $in: ["queued", "submitting"] }, payloadExpiresAt: { $gt: now },
    }, { $set: { submissionState: "submitting", updatedAt: now } }, { session });
    return result.matchedCount === 1;
  }));
}

function statusFor(delivery: Document) {
  if (delivery.bouncedAt || delivery.complainedAt) return "failed";
  if (delivery.deliveredAt) return "delivered";
  return delivery.submissionState === "submitting" ? "unknown" : String(delivery.submissionState);
}

export async function invitationEmailDetails(user: User, weddingId: string, campaignId: string) {
  const wedding = await access(user, weddingId);
  if (!id.safeParse(campaignId).success) throw missing();
  const db = await getDatabase();
  const campaign = await db.collection("emailCampaigns").findOne({ _id: new ObjectId(campaignId), weddingId: wedding._id });
  if (!campaign) throw missing();
  const delivery = await db.collection("deliveries").findOne({ _id: campaign.deliveryId, weddingId: wedding._id, campaignId: campaign._id });
  if (!delivery) throw missing();
  return {
    id: campaignId, householdId: String(campaign.householdId),
    snapshot: JSON.parse(decrypt(campaign.snapshotEncrypted as Encrypted)) as InvitationEmailSnapshot,
    status: statusFor(delivery), version: campaign.version as number,
    createdAt: campaign.createdAt.toISOString() as string,
    acceptedAt: delivery.acceptedAt?.toISOString() as string | undefined,
    deliveredAt: delivery.deliveredAt?.toISOString() as string | undefined,
    cancelledAt: delivery.cancelledAt?.toISOString() as string | undefined,
    canCancel: wedding.state === "active" && delivery.submissionState === "queued",
  };
}

export async function invitationEmailHistory(user: User, weddingId: string, householdId: string) {
  const wedding = await access(user, weddingId);
  if (!id.safeParse(householdId).success || !await storageReady()) return [];
  return (await (await getDatabase()).collection("emailCampaigns").find({
    weddingId: wedding._id, householdId: new ObjectId(householdId),
  }, { projection: { _id: 1, createdAt: 1 } }).sort({ _id: -1 }).limit(10).toArray())
    .map(row => ({ id: row._id.toHexString(), date: row.createdAt.toISOString() as string }));
}

export async function cancelInvitationEmail(user: User, weddingId: string, campaignId: string, raw: unknown) {
  const { expectedVersion } = z.strictObject({ expectedVersion: z.number().int().positive() }).parse(raw);
  if (!id.safeParse(campaignId).success) throw missing();
  const db = await getDatabase();
  return db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await access(user, weddingId, session);
    const campaign = await db.collection("emailCampaigns").findOne({ _id: new ObjectId(campaignId), weddingId: wedding._id }, { session });
    if (!campaign) throw missing();
    const filter = { _id: campaign.deliveryId, weddingId: wedding._id, campaignId: campaign._id };
    const delivery = await db.collection("deliveries").findOne(filter, { session });
    if (delivery?.submissionState === "cancelled") return { saved: true };
    if (wedding.state !== "active") throw archived();
    if (campaign.version !== expectedVersion || delivery?.submissionState !== "queued")
      throw new AccountError(409, "EMAIL_CANNOT_CANCEL", "This email can no longer be cancelled. Check its current status.");
    const now = new Date();
    await db.collection("deliveries").updateOne(filter, {
      $set: { submissionState: "cancelled", updatedAt: now, cancelledAt: now }, $unset: { payloadEncrypted: "" }, $inc: { version: 1 },
    }, { session });
    await db.collection("jobs").updateOne({ kind: "guest_invitation_send", "payloadRef.deliveryId": delivery._id }, {
      $set: { state: "cancelled", completedAt: now, updatedAt: now }, $unset: { leaseOwner: "", leaseUntil: "" },
    }, { session });
    await db.collection("emailCampaigns").updateOne({ _id: campaign._id }, { $inc: { version: 1 }, $set: { updatedAt: now } }, { session });
    return { saved: true };
  }, { writeConcern: { w: "majority" } }));
}
