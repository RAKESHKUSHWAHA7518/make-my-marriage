import "server-only";
import { Long, ObjectId, type Document, type ClientSession } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, decrypt, digest, encrypt, origin, randomToken, type Encrypted } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { householdGalleryWedding, householdGalleryGrant } from "@/modules/guest-access/service";
import { galleryFamilyAccess, mediaReady } from "./access";

const secretPattern = /^[A-Za-z0-9_-]{43}$/;
export type GuestUploadActor = { _id: ObjectId; kind: "gallery" | "household"; token: string; weddingId: ObjectId; galleryTokenVersion?: number; capabilityLinkId?: ObjectId; capabilityVersion?: number };
export async function guestUploadsReady() {
  await galleryAccessReady();
  if (!(await (await getDatabase()).collection("uploadIntents").indexes()).some(index => index.name === "media_guest_operation")) throw new AccountError(503, "GUEST_UPLOADS_NOT_READY", "Guest photo uploads are not activated yet.");
}
export async function guestUploadActor(kind: "gallery" | "household", token?: string): Promise<GuestUploadActor> {
  await guestUploadsReady();
  if (!token || !secretPattern.test(token)) throw galleryUnavailable();
  const row = await (await getDatabase()).collection("capabilitySessions").findOne({ kind, tokenHash: digest(token), expiresAt: { $gt: new Date() }, revokedAt: { $exists: false } });
  if (!row) throw galleryUnavailable();
  const actor = { _id: row._id, kind, token, weddingId: row.weddingId as ObjectId, galleryTokenVersion: row.galleryTokenVersion as number | undefined, capabilityLinkId: row.capabilityLinkId as ObjectId | undefined, capabilityVersion: row.capabilityVersion as number | undefined };
  await authorizeGuestUpload(actor);
  return actor;
}
/** Fence the actual session/grant and wedding so revocation and settings race safely with saves. */
export async function authorizeGuestUpload(actor: GuestUploadActor, session?: ClientSession, mutate = false, uploading = false) {
  await guestUploadsReady(); const db = await getDatabase(), now = new Date();
  const filter = { _id: actor._id, weddingId: actor.weddingId, kind: actor.kind, tokenHash: digest(actor.token), expiresAt: { $gt: now }, revokedAt: { $exists: false } };
  const current = mutate ? await db.collection("capabilitySessions").findOneAndUpdate(filter, { $set: { lastSeenAt: now } }, { session, returnDocument: "after" }) : await db.collection("capabilitySessions").findOne(filter, { session });
  if (!current) throw galleryUnavailable();
  if (actor.kind === "household") {
    const grant = await householdGalleryGrant(actor.token, session, mutate);
    if (grant.link._id.toString() !== actor.capabilityLinkId?.toString() || grant.link.version !== actor.capabilityVersion) throw galleryUnavailable();
  } else if (current.galleryTokenVersion !== actor.galleryTokenVersion) throw galleryUnavailable();
  const scope = { _id: actor.weddingId, "gallery.isEnabled": true, ...(actor.kind === "gallery" ? { "gallery.tokenVersion": actor.galleryTokenVersion } : {}) };
  const wedding = mutate ? await db.collection("weddings").findOneAndUpdate(scope, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" }) : await db.collection("weddings").findOne(scope, { session });
  if (!wedding) throw galleryUnavailable();
  if (uploading && wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Photo uploads are unavailable.");
  if (uploading && !wedding.gallery.guestUploadsEnabled) throw new AccountError(403, "GUEST_UPLOADS_DISABLED", "Photo uploads are currently turned off. You can still view the gallery.");
  return wedding;
}
export const galleryUnavailable = () => new AccountError(404, "GALLERY_UNAVAILABLE", "This gallery is unavailable. Please contact the family who shared the link.");
export async function galleryAccessReady() {
  await mediaReady();
  const db = await getDatabase();
  if (!await db.listCollections({ name: "capabilitySessions" }).hasNext() || !(await db.collection("capabilitySessions").indexes()).some(i => i.name === "capability_gallery_session")) throw new AccountError(503, "GALLERY_ACCESS_NOT_READY", "Gallery sharing is not activated yet.");
}
function settings(wedding: Document) {
  return { isEnabled: wedding.gallery.isEnabled as boolean, guestUploadsEnabled: wedding.gallery.guestUploadsEnabled as boolean, tokenVersion: wedding.gallery.tokenVersion as number, weddingState: wedding.state as string, version: wedding.version as number };
}
export type GallerySettings = ReturnType<typeof settings>;
export async function gallerySettings(user: User, weddingId: string) {
  await galleryAccessReady(); const wedding = await galleryFamilyAccess(user);
  if (wedding._id.toString() !== weddingId) throw galleryUnavailable(); return settings(wedding);
}
const changeSchema = z.strictObject({ isEnabled: z.boolean().optional(), guestUploadsEnabled: z.boolean().optional(), expectedVersion: z.number().int().positive() }).refine(value => value.isEnabled !== undefined || value.guestUploadsEnabled !== undefined, "Choose a setting to change.");
const rotateSchema = z.strictObject({ expectedVersion: z.number().int().positive(), expectedTokenVersion: z.number().int().positive() });
export async function manageGallery(user: User, weddingId: string, action: "settings" | "share" | "rotate", payload?: unknown, key?: string | null) {
  await galleryAccessReady();
  const input = action === "settings" ? changeSchema.parse(payload) : action === "rotate" ? rotateSchema.parse(payload) : null;
  if (action === "rotate" && (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key))) throw new AccountError(400, "SAVE_KEY_REQUIRED", "A valid save key is required.");
  const db = await getDatabase(), scopeKey = `user:${user._id}:gallery:${weddingId}:rotate`, keyHash = digest(key ?? ""), requestHash = digest(JSON.stringify(input));
  return db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await galleryFamilyAccess(user, session, true), now = new Date();
    if (wedding._id.toString() !== weddingId) throw galleryUnavailable();
    const member = await db.collection("memberships").findOne({ userId: user._id, weddingId: wedding._id, status: "active" }, { session });
    if (action === "rotate" && member?.role !== "ADMIN") throw new AccountError(403, "FORBIDDEN", "Only an administrator can replace the gallery link.");
    const previous = action === "rotate" && await db.collection("idempotencyKeys").findOne({ scopeKey, keyHash }, { session });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AccountError(409, "IDEMPOTENCY_CONFLICT", "This save key was used for different changes.");
      if (previous.afterVersion !== wedding.gallery.tokenVersion) throw new AccountError(409, "VERSION_CONFLICT", "The gallery link changed again. Reload before sharing.");
    } else if (input) {
      if (wedding.version !== input.expectedVersion || ("expectedTokenVersion" in input && wedding.gallery.tokenVersion !== input.expectedTokenVersion)) throw new AccountError(409, "VERSION_CONFLICT", "Gallery settings changed. Reload before saving.");
      if (action === "settings") {
        const changes = changeSchema.parse(payload), enabled = changes.isEnabled ?? wedding.gallery.isEnabled, uploads = enabled ? changes.guestUploadsEnabled ?? wedding.gallery.guestUploadsEnabled : false;
        if (changes.guestUploadsEnabled === true && !enabled) throw new AccountError(422, "UPLOADS_REQUIRE_GALLERY", "Enable gallery viewing before allowing uploads.");
        if (uploads) await guestUploadsReady();
        if (wedding.state !== "active" && !(member?.role === "ADMIN" && (!enabled || wedding.gallery.isEnabled) && (!uploads || wedding.gallery.guestUploadsEnabled))) throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Only restrictive administrator privacy changes are allowed.");
      } else if (wedding.state !== "active" && member?.role !== "ADMIN") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived.");
      const values: Record<string, unknown> = { updatedAt: now };
      if (action === "settings") {
        const changes = changeSchema.parse(payload), enabled = changes.isEnabled ?? wedding.gallery.isEnabled;
        values["gallery.isEnabled"] = enabled;
        values["gallery.guestUploadsEnabled"] = enabled ? changes.guestUploadsEnabled ?? wedding.gallery.guestUploadsEnabled : false;
        wedding.gallery.isEnabled = enabled; wedding.gallery.guestUploadsEnabled = values["gallery.guestUploadsEnabled"];
      } else {
        const raw = randomToken();
        values["gallery.tokenHash"] = digest(raw); values["gallery.encryptedSecret"] = encrypt(raw, "CAPABILITY_ENCRYPTION_KEY"); values["gallery.tokenVersion"] = wedding.gallery.tokenVersion + 1;
        wedding.gallery = { ...wedding.gallery, tokenHash: values["gallery.tokenHash"], encryptedSecret: values["gallery.encryptedSecret"], tokenVersion: values["gallery.tokenVersion"] };
      }
      await db.collection("weddings").updateOne({ _id: wedding._id, version: input.expectedVersion }, { $set: values, $inc: { version: 1 } }, { session }); wedding.version++;
      await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, entityType: "wedding", entityId: wedding._id, action: action === "rotate" ? "gallery.link_rotated" : "gallery.settings_updated", summary: action === "rotate" ? "Gallery link replaced" : "Gallery sharing updated", occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
      if (action === "rotate") await db.collection("idempotencyKeys").insertOne({ scopeKey, keyHash, requestHash, state: "completed", resourceId: wedding._id, afterVersion: wedding.gallery.tokenVersion, expiresAt: new Date(now.getTime() + 7 * 86400000), schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    }
    if (action === "settings") return { settings: settings(wedding) };
    if (action === "share" && !wedding.gallery.isEnabled) throw galleryUnavailable();
    return { settings: settings(wedding), url: `${origin()}/gallery#token=${decrypt(wedding.gallery.encryptedSecret as Encrypted, "CAPABILITY_ENCRYPTION_KEY")}`, tokenVersion: wedding.gallery.tokenVersion as number };
  }, { writeConcern: { w: "majority" } }));
}
export async function exchangeGallery(raw: string) {
  if (!secretPattern.test(raw)) throw galleryUnavailable(); await galleryAccessReady();
  const db = await getDatabase(), token = randomToken(), now = new Date();
  await db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await db.collection("weddings").findOneAndUpdate({ "gallery.tokenHash": digest(raw), "gallery.isEnabled": true, state: { $in: ["active", "archived"] } }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" });
    if (!wedding) throw galleryUnavailable();
    await db.collection("capabilitySessions").insertOne({ weddingId: wedding._id, kind: "gallery", galleryTokenVersion: wedding.gallery.tokenVersion, tokenHash: digest(token), expiresAt: new Date(now.getTime() + 7 * 86400000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
  }, { writeConcern: { w: "majority" } })); return token;
}
export async function logoutGallery(raw?: string) {
  if (raw && secretPattern.test(raw)) await (await getDatabase()).collection("capabilitySessions").updateOne({ kind: "gallery", tokenHash: digest(raw) }, { $set: { revokedAt: new Date() } });
}
async function guestWedding(raw?: string, household?: string) {
  await galleryAccessReady(); const db = await getDatabase();
  let wedding;
  if (raw) {
    if (!secretPattern.test(raw)) throw galleryUnavailable();
    const session = await db.collection("capabilitySessions").findOne({ kind: "gallery", tokenHash: digest(raw), expiresAt: { $gt: new Date() }, revokedAt: { $exists: false } });
    if (!session) throw galleryUnavailable();
    wedding = await db.collection("weddings").findOne({ _id: session.weddingId, "gallery.tokenVersion": session.galleryTokenVersion, state: { $in: ["active", "archived"] } });
  } else if (household) { try { wedding = await householdGalleryWedding(household); } catch (e) { if (e instanceof AccountError && e.status === 404) throw galleryUnavailable(); throw e; } }
  if (!wedding?.gallery.isEnabled) throw galleryUnavailable(); return wedding;
}
export async function guestGallery(raw?: string, household?: string, cursor?: string) {
  const wedding = await guestWedding(raw, household), db = await getDatabase();
  if (cursor && !/^[a-f0-9]{24}$/.test(cursor)) throw galleryUnavailable();
  const scope = { weddingId: wedding._id, purpose: "gallery", visibility: "gallery", state: "ready" };
  const photos = await db.collection("assets").find({ ...scope, ...(cursor ? { _id: { $lt: new ObjectId(cursor) } } : {}) }).sort({ _id: -1 }).limit(25).toArray();
  return { couple: { brideName: wedding.couple.brideName as string, groomName: wedding.couple.groomName as string }, photos: photos.slice(0, 24).map(p => ({ id: p._id.toString(), width: p.width as number, height: p.height as number })), nextCursor: photos.length > 24 ? photos[23]._id.toString() : null, count: await db.collection("assets").countDocuments(scope), archived: wedding.state === "archived", uploadsEnabled: wedding.state === "active" && wedding.gallery.guestUploadsEnabled === true };
}
export type GuestGalleryData = Awaited<ReturnType<typeof guestGallery>>;
export async function guestGalleryAsset(id: string, raw?: string, household?: string) {
  const wedding = await guestWedding(raw, household);
  if (!/^[a-f0-9]{24}$/.test(id)) throw galleryUnavailable();
  const asset = await (await getDatabase()).collection("assets").findOne({ _id: new ObjectId(id), weddingId: wedding._id, purpose: "gallery", visibility: "gallery", state: "ready" });
  if (!asset) throw galleryUnavailable(); return asset;
}
