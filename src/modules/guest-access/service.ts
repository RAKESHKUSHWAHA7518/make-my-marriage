import "server-only";
import { Long, ObjectId, type ClientSession, type Document } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, decrypt, digest, encrypt, origin, randomToken, type Encrypted } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "@/modules/weddings/service";
import { householdsReady } from "@/modules/households/service";
import { rotateLinkSchema, rsvpSchema } from "./schema";

export const guestSessionSeconds = 7 * 86400;
export const invitationUnavailable = () => new AccountError(404, "INVITATION_UNAVAILABLE", "This invitation is unavailable. Please contact the family who shared it.");
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
const live = (now: Date) => ({ active: true, $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] });
export async function guestAccessReady() {
  await householdsReady(); const db = await getDatabase();
  if (!(await db.collection("idempotencyKeys").indexes()).some((i) => i.unique && Object.keys(i.key).join() === "scopeKey,keyHash")) throw new AccountError(503, "GUEST_ACCESS_UNAVAILABLE", "Invitations are temporarily unavailable. Please retry.");
  for (const [name, required] of [["capabilityLinks", ["capability_link_token", "capability_household_active"]], ["capabilitySessions", ["capability_session_token", "capability_session_expiry"]]] as const) {
    if (!await db.listCollections({ name }).hasNext()) throw new AccountError(503, "GUEST_ACCESS_UNAVAILABLE", "Invitations are temporarily unavailable. Please retry.");
    const indexes = await db.collection(name).indexes();
    if (!required.every((key) => indexes.some((i) => i.name === key))) throw new AccountError(503, "GUEST_ACCESS_UNAVAILABLE", "Invitations are temporarily unavailable. Please retry.");
  }
}
function keyCheck(key: string | null) { if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new AccountError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid save key is required."); return key; }
async function eligible(weddingId: ObjectId, household: Document, session?: ClientSession) {
  return (await getDatabase()).collection("events").find({ weddingId, _id: { $in: household.invitedEventIds }, status: { $in: ["scheduled", "completed"] } }, { session, projection: { name: 1, startsAt: 1, endsAt: 1, venue: 1, description: 1, dressCode: 1, version: 1 } }).sort({ startsAt: 1, _id: 1 }).toArray();
}
const revision = (wedding: Document, household: Document, events: Document[]) => digest(JSON.stringify([household._id.toString(), wedding.state, wedding.timezone, wedding.rsvpDeadline?.toISOString(), events.map((e) => [e._id.toString(), e.version])]));
function safeMap(value: unknown) { try { const url = new URL(String(value)); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } }
function siteView(wedding: Document, household: Document, events: Document[]) {
  return {
    galleryAvailable: wedding.gallery.isEnabled === true && events.length > 0,
    couple: { brideName: wedding.couple.brideName as string, groomName: wedding.couple.groomName as string }, timezone: wedding.timezone as string,
    household: { name: household.displayName as string, representativeName: household.representative.name as string },
    events: events.map((e) => ({ id: e._id.toString(), name: e.name as string, startsAt: e.startsAt.toISOString() as string, endsAt: e.endsAt?.toISOString() as string | undefined, venue: { name: e.venue.name as string, address: e.venue.address as string, mapUrl: safeMap(e.venue.mapUrl) }, description: e.description as string | undefined, dressCode: e.dressCode as string | undefined })),
    rsvp: { status: household.rsvp.status as "pending" | "attending" | "not_attending" | "maybe", attendeeCount: household.rsvp.attendeeCount as number, maxGuests: household.maxGuests as number, version: household.version as number, deadline: wedding.rsvpDeadline?.toISOString() as string | undefined, deadlinePassed: !!wedding.rsvpDeadline && new Date() > wedding.rsvpDeadline, respondedAt: household.rsvp.respondedAt?.toISOString() as string | undefined, updatedAfterDeadline: household.rsvp.updatedAfterDeadline as boolean, editable: wedding.state === "active" && events.length > 0, invitationRevision: revision(wedding, household, events) }, archived: wedding.state === "archived",
  };
}
export type GuestSite = ReturnType<typeof siteView>;

/** Link retrieval/issuance and rotation share the existing family write fences. */
export async function invitationLink(user: User, weddingId: string, householdId: string, rotation?: { payload: unknown; key: string | null }) {
  const member = await membershipFor(user);
  if (!member || member.status !== "active" || member.weddingId.toString() !== weddingId || !["ADMIN", "MANAGER"].includes(member.role) || !/^[a-f0-9]{24}$/.test(householdId)) throw invitationUnavailable();
  const input = rotation ? rotateLinkSchema.parse(rotation.payload) : null;
  const keyHash = rotation ? digest(keyCheck(rotation.key)) : "", scopeKey = `user:${user._id}:household:${householdId}:link:rotate`, requestHash = input ? digest(JSON.stringify(input)) : "";
  await guestAccessReady(); const db = await getDatabase();
  return db.client.withSession((session) => session.withTransaction(async () => {
    const now = new Date();
    const wedding = await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    const actor = await db.collection("users").findOneAndUpdate({ _id: user._id, credentialVersion: user.credentialVersion, status: "active" }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
    const current = wedding && await db.collection("memberships").findOneAndUpdate({ _id: member._id, userId: user._id, weddingId: wedding._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!wedding || !current) throw invitationUnavailable();
    const household = await db.collection("households").findOne({ _id: new ObjectId(householdId), weddingId: wedding._id, status: "active" }, { session });
    if (!household) throw invitationUnavailable();
    let link = await db.collection("capabilityLinks").findOne({ weddingId: wedding._id, kind: "household", subjectId: household._id, active: true }, { session });
    const previous = rotation && await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for different changes.");
      if (!link || link.version !== previous.afterVersion) throw new AccountError(409, "LINK_VERSION_CONFLICT", "This invitation link changed again. Reload before sharing.");
    } else if (rotation || !link) {
      if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Only an existing invitation link may be copied.");
      if (rotation && (!link || link.version !== input!.expectedLinkVersion)) throw new AccountError(409, "LINK_VERSION_CONFLICT", "This invitation link changed. Reload before replacing it.");
      const raw = randomToken(), values = { tokenHash: digest(raw), encryptedSecret: encrypt(raw, "CAPABILITY_ENCRYPTION_KEY"), updatedAt: now };
      if (link) link = await db.collection("capabilityLinks").findOneAndUpdate({ _id: link._id, version: link.version }, { $set: values, $inc: { version: 1 } }, { session, returnDocument: "after" });
      else { link = { _id: new ObjectId(), weddingId: wedding._id, kind: "household", subjectId: household._id, ...values, active: true, version: 1, createdBy: user._id, schemaVersion: 1, createdAt: now }; await db.collection("capabilityLinks").insertOne(link, { session }); }
      if (!link) throw new AccountError(409, "LINK_VERSION_CONFLICT", "Reload the invitation link.");
      await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, action: rotation ? "household.link_rotated" : "household.link_created", entityType: "household", entityId: household._id, summary: rotation ? "Household invitation link replaced" : "Household invitation link created", occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
      if (rotation) await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "capabilityLink", resourceId: link._id, afterVersion: link.version, responseCode: 200, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    }
    if (!link || (link.expiresAt && link.expiresAt <= now)) throw invitationUnavailable();
    return { url: `${origin()}/invite#token=${decrypt(link.encryptedSecret as Encrypted, "CAPABILITY_ENCRYPTION_KEY")}`, linkVersion: link.version as number };
  }, { writeConcern: { w: "majority" } }));
}

export async function exchangeHousehold(raw: string) {
  if (!secretPattern.test(raw)) throw invitationUnavailable(); await guestAccessReady(); const db = await getDatabase(), now = new Date();
  const token = randomToken();
  await db.client.withSession((session) => session.withTransaction(async () => {
    const link = await db.collection("capabilityLinks").findOneAndUpdate({ kind: "household", tokenHash: digest(raw), ...live(now) }, { $set: { updatedAt: now } }, { session, returnDocument: "after" });
    if (!link || !await db.collection("households").findOne({ _id: link.subjectId, weddingId: link.weddingId, status: "active" }, { session }) || !await db.collection("weddings").findOne({ _id: link.weddingId, state: { $in: ["active", "archived"] } }, { session })) throw invitationUnavailable();
    await db.collection("capabilitySessions").insertOne({ weddingId: link.weddingId, kind: "household", capabilityLinkId: link._id, capabilityVersion: link.version, tokenHash: digest(token), expiresAt: new Date(now.getTime() + guestSessionSeconds * 1000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
  }, { writeConcern: { w: "majority" } }));
  return token;
}
async function resolve(raw: string | undefined, session?: ClientSession) {
  if (!raw || !secretPattern.test(raw)) throw invitationUnavailable(); const db = await getDatabase(), now = new Date();
  const grantSession = await db.collection("capabilitySessions").findOne({ kind: "household", tokenHash: digest(raw), expiresAt: { $gt: now }, revokedAt: { $exists: false } }, { session });
  if (!grantSession) throw invitationUnavailable();
  const link = await db.collection("capabilityLinks").findOne({ _id: grantSession.capabilityLinkId, weddingId: grantSession.weddingId, kind: "household", version: grantSession.capabilityVersion, ...live(now) }, { session });
  if (!link) throw invitationUnavailable();
  const household = await db.collection("households").findOne({ _id: link.subjectId, weddingId: link.weddingId, status: "active" }, { session });
  const wedding = await db.collection("weddings").findOne({ _id: link.weddingId, state: { $in: ["active", "archived"] } }, { session });
  if (!household || !wedding) throw invitationUnavailable(); return { grantSession, link, household, wedding };
}
export async function guestSite(raw: string | undefined): Promise<GuestSite> {
  await guestAccessReady(); const { household, wedding } = await resolve(raw); return siteView(wedding, household, await eligible(wedding._id, household));
}
/** Household authority is independent of the shared gallery token. */
export async function householdGalleryWedding(raw: string | undefined) {
  await guestAccessReady();
  const { household, wedding } = await resolve(raw);
  if (!(await eligible(wedding._id, household)).length) throw invitationUnavailable();
  return wedding;
}
export async function householdGalleryGrant(raw: string, session?: ClientSession, mutate = false) {
  await guestAccessReady();
  let grant = await resolve(raw, session);
  if (mutate) {
    const db = await getDatabase(), now = new Date();
    if (!await db.collection("capabilitySessions").findOneAndUpdate({ _id: grant.grantSession._id, kind: "household", expiresAt: { $gt: now }, revokedAt: { $exists: false } }, { $set: { lastSeenAt: now } }, { session })) throw invitationUnavailable();
    if (!await db.collection("capabilityLinks").findOneAndUpdate({ _id: grant.link._id, version: grant.link.version, ...live(now) }, { $set: { updatedAt: now } }, { session })) throw invitationUnavailable();
    // Household removal/reassignment must conflict with upload finalization.
    if (!await db.collection("households").findOneAndUpdate({ _id: grant.household._id, status: "active", version: grant.household.version }, { $set: { updatedAt: now } }, { session })) throw invitationUnavailable();
    grant = await resolve(raw, session);
  }
  if (!(await eligible(grant.wedding._id, grant.household, session)).length) throw invitationUnavailable();
  return grant;
}
export async function logoutHousehold(raw: string | undefined) {
  if (raw && secretPattern.test(raw)) await (await getDatabase()).collection("capabilitySessions").updateOne({ tokenHash: digest(raw), kind: "household" }, { $set: { revokedAt: new Date(), updatedAt: new Date() } });
}
export async function saveGuestRsvp(raw: string | undefined, payload: unknown, key: string | null): Promise<GuestSite> {
  await guestAccessReady(); const initial = await resolve(raw), input = rsvpSchema.parse(payload), keyHash = digest(keyCheck(key)), requestHash = digest(JSON.stringify(input)), db = await getDatabase();
  const scopeKey = `household:${initial.link._id}:v${initial.link.version}:rsvp`;
  return db.client.withSession((session) => session.withTransaction(async () => {
    const now = new Date();
    const weddingFence = await db.collection("weddings").findOneAndUpdate({ _id: initial.wedding._id }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    if (!weddingFence) throw invitationUnavailable();
    // Touch both sources of authorization so replacement/logout conflict with a save.
    if (!await db.collection("capabilityLinks").findOneAndUpdate({ _id: initial.link._id, version: initial.link.version, ...live(now) }, { $set: { updatedAt: now } }, { session, returnDocument: "after" })) throw invitationUnavailable();
    if (!await db.collection("capabilitySessions").findOneAndUpdate({ _id: initial.grantSession._id, revokedAt: { $exists: false }, expiresAt: { $gt: now } }, { $set: { lastSeenAt: now, updatedAt: now } }, { session, returnDocument: "after" })) throw invitationUnavailable();
    const { household, wedding } = await resolve(raw, session), events = await eligible(wedding._id, household, session);
    const previous = await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (previous) { if (previous.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for a different response."); return siteView(wedding, household, events); }
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Responses are read-only.");
    if (!events.length) throw new AccountError(409, "NO_ELIGIBLE_EVENTS", "Your invitation details aren’t available yet. Please check with the family who shared this link.");
    if (household.version !== input.expectedVersion || revision(wedding, household, events) !== input.expectedInvitationRevision) throw new AccountError(409, "VERSION_CONFLICT", "This invitation changed while you were responding. Reload the latest details before saving.");
    if (input.attendeeCount > household.maxGuests) throw new AccountError(422, "GUEST_LIMIT_EXCEEDED", `Enter a whole number between 1 and ${household.maxGuests}.`);
    const rsvp = { status: input.status, attendeeCount: input.attendeeCount, respondedAt: now, respondedBy: { type: "household", capabilitySessionId: initial.grantSession._id }, updatedAfterDeadline: !!wedding.rsvpDeadline && now > wedding.rsvpDeadline };
    const saved = await db.collection("households").findOneAndUpdate({ _id: household._id, weddingId: wedding._id, status: "active", version: input.expectedVersion }, { $set: { rsvp, updatedAt: now }, $inc: { version: 1 } }, { session, returnDocument: "after" });
    if (!saved) throw new AccountError(409, "VERSION_CONFLICT", "Reload the latest invitation before saving.");
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "household", householdId: household._id }, action: "household.rsvp_updated", entityType: "household", entityId: household._id, summary: "Household response updated", beforeVersion: household.version, afterVersion: saved.version, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceType: "household", resourceId: household._id, responseCode: 200, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return siteView(wedding, saved, events);
  }, { writeConcern: { w: "majority" } }));
}
