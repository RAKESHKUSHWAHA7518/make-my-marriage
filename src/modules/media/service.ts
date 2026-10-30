import "server-only";
import { randomBytes } from "node:crypto";
import { Long, ObjectId, type ClientSession, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError, digest } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { deleteGalleryTarget, galleryMaxBytes, inspectGalleryAsset, InvalidPhotoError, signedGalleryUpload } from "@/infrastructure/cloudinary/provider";

const missing = () => new AccountError(404, "MEDIA_UNAVAILABLE", "Photo or upload unavailable.");
const id = (value: string) => { if (!/^[a-f0-9]{24}$/.test(value)) throw missing(); return new ObjectId(value); };
const uploadSchema = z.strictObject({ purpose: z.literal("gallery"), filename: z.string().trim().min(1).max(200).regex(/\.(jpe?g|png|webp)$/i), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), sizeBytes: z.string().regex(/^[1-9]\d{0,7}$/).transform(Number).pipe(z.number().int().max(galleryMaxBytes)) });
export const versionSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export async function mediaReady() {
  const db = await getDatabase();
  for (const [name, index] of [["assets", "media_gallery"], ["uploadIntents", "media_operation"]]) {
    if (!await db.listCollections({ name }).hasNext() || !(await db.collection(name).indexes()).some(i => i.name === index)) throw new AccountError(503, "MEDIA_NOT_READY", "The gallery is not activated in this environment yet.");
  }
}
async function access(user: User, session?: ClientSession, mutate = false) {
  const db = await getDatabase(), now = new Date();
  const member = await db.collection("memberships").findOne({ userId: user._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { session });
  if (!member) throw missing();
  const actor = mutate ? await db.collection("users").findOneAndUpdate({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $exists: true } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" }) : await db.collection("users").findOne({ _id: user._id, status: "active", credentialVersion: user.credentialVersion, emailVerifiedAt: { $exists: true } }, { session });
  if (!actor) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in again.");
  if (mutate && !await db.collection("memberships").findOneAndUpdate({ _id: member._id, status: "active", role: { $in: ["ADMIN", "MANAGER"] } }, { $set: { updatedAt: now } }, { session, returnDocument: "after" })) throw missing();
  const wedding = mutate ? await db.collection("weddings").findOneAndUpdate({ _id: member.weddingId }, { $inc: { writeFence: Long.ONE } }, { session, returnDocument: "after" }) : await db.collection("weddings").findOne({ _id: member.weddingId }, { session });
  if (!wedding) throw missing();
  return wedding;
}
function active(wedding: Document) { if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Photos are read-only."); }
function view(asset: Document) { return { id: asset._id.toString(), filename: asset.filename as string, version: asset.version as number, bytes: asset.bytes.toString() as string, width: asset.width as number, height: asset.height as number }; }
export type GalleryPhoto = ReturnType<typeof view>;
async function audit(session: ClientSession, weddingId: ObjectId, actor: Document, entityId: ObjectId, action: string) {
  const now = new Date(); await (await getDatabase()).collection("activity").insertOne({ weddingId, actor, entityType: "asset", entityId, action, summary: action === "media.ready" ? "Photo added to family gallery" : "Photo removed from gallery", occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
}
export async function listGallery(user: User, cursor?: string) {
  await mediaReady(); const wedding = await access(user), db = await getDatabase();
  const scope = { weddingId: wedding._id, purpose: "gallery", state: "ready" };
  const rows = await db.collection("assets").find({ ...scope, ...(cursor ? { _id: { $lt: id(cursor) } } : {}) }).sort({ _id: -1 }).limit(25).toArray();
  return { photos: rows.slice(0,24).map(view), nextCursor: rows.length > 24 ? rows[23]._id.toString() : null, count: await db.collection("assets").countDocuments(scope), archived: wedding.state !== "active", storage: { usedBytes: wedding.storage.usedBytes.toString() as string, reservedBytes: wedding.storage.reservedBytes.toString() as string, limitBytes: wedding.storage.limitBytes.toString() as string } };
}
export type GalleryPageData = Awaited<ReturnType<typeof listGallery>>;
function intentView(row: Document) { return { id: row._id.toString(), state: row.state as string, expiresAt: row.expiresAt.toISOString() as string, assetId: row.assetId?.toString() as string | undefined }; }
export async function createUpload(user: User, payload: unknown, key: string | null) {
  const input = uploadSchema.parse(payload); if (!key || !/^[\w-]{16,128}$/.test(key)) throw new AccountError(400,"SAVE_KEY_REQUIRED","A valid upload key is required.");
  await mediaReady(); const db = await getDatabase(), operationKey = digest(key), requestHash = digest(JSON.stringify(input));
  // Configuration/signing failures happen before reserving storage.
  signedGalleryUpload(`mmm/${new ObjectId()}/gallery/${randomBytes(16).toString("hex")}`);
  const row = await db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await access(user, session, true); active(wedding);
    const previous = await db.collection("uploadIntents").findOne({ "actor.userId": user._id, operationKey }, { session });
    if (previous) { if (previous.requestHash !== requestHash) throw new AccountError(409,"IDEMPOTENCY_CONFLICT","This upload key belongs to a different file."); return previous; }
    const reserved = Long.fromNumber(input.sizeBytes), now = new Date();
    const changed = await db.collection("weddings").updateOne({ _id: wedding._id, $expr: { $lte: [{ $add: ["$storage.usedBytes", "$storage.reservedBytes", reserved] }, "$storage.limitBytes"] } }, { $inc: { "storage.reservedBytes": reserved } }, { session });
    if (!changed.modifiedCount) throw new AccountError(409,"STORAGE_FULL","Your wedding storage allowance is reached.");
    const intent = { _id: new ObjectId(), weddingId: wedding._id, actor: { type: "user", userId: user._id, credentialVersion: user.credentialVersion }, purpose: "gallery", filename: input.filename, sizeBytes: input.sizeBytes, reservedBytes: reserved, maxBytes: galleryMaxBytes, operationKey, requestHash, expectedPublicId: `mmm/${wedding._id}/gallery/${randomBytes(16).toString("hex")}`, state: "reserved", expiresAt: new Date(now.getTime()+15*60000), nextCheckAt: new Date(now.getTime()+15*60000), version: 1, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("uploadIntents").insertOne(intent, { session }); return intent;
  }, { writeConcern: { w: "majority" } }));
  if (!row || row.state !== "reserved" || row.expiresAt <= new Date()) throw new AccountError(409,"UPLOAD_EXPIRED","This upload must be reconciled before starting again.");
  return { ...intentView(row), maxBytes: row.maxBytes, upload: signedGalleryUpload(row.expectedPublicId, row.createdAt) };
}
export async function uploadFor(user: User, intentId: string) {
  await mediaReady(); const wedding = await access(user), row = await (await getDatabase()).collection("uploadIntents").findOne({ _id: id(intentId), weddingId: wedding._id, "actor.userId": user._id });
  if (!row) throw missing(); return intentView(row);
}
/** Provider calls stay outside transactions. Fences recheck authority and lifecycle before publication. */
export async function completeUpload(user: User, intentId: string) {
  await uploadFor(user, intentId); const db = await getDatabase(), initial = await db.collection("uploadIntents").findOne({ _id: id(intentId), "actor.userId": user._id });
  if (!initial) throw missing();
  if (initial.actor.credentialVersion !== user.credentialVersion) throw new AccountError(403,"UPLOAD_AUTH_CHANGED","Your sign-in changed. This upload will be reconciled.");
  if (initial.state === "finalized") {
    if (!await db.collection("assets").findOne({ _id: initial.assetId, weddingId: initial.weddingId, state: "ready", purpose: "gallery" })) throw new AccountError(409,"PHOTO_REMOVED","This upload was saved previously, but its photo has since been removed.");
    return { ...(await uploadFor(user, intentId)), ready: true };
  }
  if (initial.state !== "reserved" || initial.expiresAt <= new Date()) throw new AccountError(409,"UPLOAD_EXPIRED","This upload expired and will be cleaned up.");
  let verified;
  try { verified = await inspectGalleryAsset(initial.expectedPublicId); }
  catch (error) { if (error instanceof InvalidPhotoError) { await rejectIntent(initial._id); throw new AccountError(422,"PHOTO_REJECTED","The photo failed verification and will be cleaned up."); } throw error; }
  if (!verified) return { ...intentView(initial), ready: false };
  const metadata = verified;
  const result = await db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await access(user, session, true); active(wedding);
    const row = await db.collection("uploadIntents").findOne({ _id: initial._id, weddingId: wedding._id, "actor.userId": user._id }, { session });
    if (!row) throw missing();
    if (row.state === "finalized") {
      if (!await db.collection("assets").findOne({ _id: row.assetId, weddingId: row.weddingId, state: "ready", purpose: "gallery" }, { session })) throw new AccountError(409,"PHOTO_REMOVED","This photo has since been removed.");
      return { ...intentView(row), ready: true };
    }
    if (row.state !== "reserved" || row.expiresAt <= new Date()) throw new AccountError(409,"UPLOAD_EXPIRED","The upload expired before verification finished.");
    const actual = Long.fromNumber(metadata.bytes), difference = actual.subtract(row.reservedBytes), now = new Date();
    const changed = await db.collection("weddings").updateOne({ _id: wedding._id, "storage.reservedBytes": { $gte: row.reservedBytes }, $expr: { $lte: [{ $add: ["$storage.usedBytes", "$storage.reservedBytes", difference] }, "$storage.limitBytes"] } }, { $inc: { "storage.reservedBytes": Long.fromValue(row.reservedBytes).negate(), "storage.usedBytes": actual } }, { session });
    if (!changed.modifiedCount) return { ...intentView(row), ready: false, quotaRejected: true };
    const assetId = new ObjectId();
    await db.collection("assets").insertOne({ _id: assetId, weddingId: wedding._id, uploadIntentId: row._id, purpose: "gallery", provider: "cloudinary", ...metadata, bytes: actual, visibility: "gallery", uploadedBy: row.actor, filename: row.filename, state: "ready", version: 1, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    await db.collection("uploadIntents").updateOne({ _id: row._id, state: "reserved" }, { $set: { state: "finalized", assetId, finalizedAt: now, reservationReleasedAt: now, updatedAt: now }, $inc: { version: 1 } }, { session });
    await audit(session, wedding._id, row.actor, assetId, "media.ready");
    return { id: row._id.toString(), state: "finalized", assetId: assetId.toString(), ready: true };
  }, { writeConcern: { w: "majority" } }));
  if (result && "quotaRejected" in result) { await rejectIntent(initial._id); throw new AccountError(409,"STORAGE_FULL","Verified photo exceeds available wedding storage and will be cleaned up."); }
  return result;
}
async function rejectIntent(intentId: ObjectId) {
  const db = await getDatabase();
  await db.client.withSession(session => session.withTransaction(async () => {
    const row = await db.collection("uploadIntents").findOne({ _id: intentId, state: "reserved" }, { session }); if (!row) return;
    const now = new Date();
    const changed = await db.collection("weddings").updateOne({ _id: row.weddingId, "storage.reservedBytes": { $gte: row.reservedBytes } }, { $inc: { writeFence: Long.ONE, "storage.reservedBytes": Long.fromValue(row.reservedBytes).negate() } }, { session });
    if (!changed.modifiedCount) throw Error("Storage accounting requires reconciliation");
    await db.collection("uploadIntents").updateOne({ _id: row._id, state: "reserved" }, { $set: { state: "rejected", reservationReleasedAt: now, nextCheckAt: now, updatedAt: now }, $inc: { version: 1 } }, { session });
  }, { writeConcern: { w: "majority" } }));
}
export async function assetFor(user: User, assetId: string) {
  await mediaReady(); const wedding = await access(user), row = await (await getDatabase()).collection("assets").findOne({ _id: id(assetId), weddingId: wedding._id, purpose: "gallery", state: "ready" });
  if (!row) throw missing(); return row;
}
export async function removeAsset(user: User, weddingId: string, assetId: string, payload: unknown) {
  const input = versionSchema.parse(payload); await mediaReady(); const db = await getDatabase();
  return db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await access(user, session, true); if (wedding._id.toString() !== weddingId) throw missing(); active(wedding);
    const row = await db.collection("assets").findOne({ _id: id(assetId), weddingId: wedding._id, purpose: "gallery" }, { session }); if (!row) throw missing();
    if (["delete_pending", "deleted"].includes(row.state) && row.version === input.expectedVersion+1) return { state: row.state };
    if (row.version !== input.expectedVersion || row.state !== "ready") throw new AccountError(409,"VERSION_CONFLICT","This photo changed. Reload the gallery.");
    await db.collection("assets").updateOne({ _id: row._id, state: "ready", version: input.expectedVersion }, { $set: { state: "delete_pending", nextCheckAt: new Date(), updatedAt: new Date() }, $inc: { version: 1 } }, { session });
    await audit(session, wedding._id, { type: "user", userId: user._id }, row._id, "media.removed"); return { state: "delete_pending" };
  }, { writeConcern: { w: "majority" } }));
}
/** Bounded scheduled reconciliation; durable nextCheckAt makes failure/restarts retryable. */
export async function reconcileMedia() {
  await mediaReady(); const db = await getDatabase(), deadline = Date.now()+25000; let processed = 0, failed = 0;
  const intents = await db.collection("uploadIntents").find({ state: { $in: ["reserved", "rejected", "expired"] }, nextCheckAt: { $lte: new Date() } }).sort({ nextCheckAt: 1 }).limit(3).toArray();
  for (const row of intents) {
    if (Date.now() > deadline) break;
    try {
      if (row.state === "reserved") { if (row.expiresAt > new Date()) continue; await rejectIntent(row._id); }
      const settled = await db.collection("uploadIntents").findOne({ _id: row._id, state: { $in: ["rejected", "expired"] } });
      if (!settled) continue;
      // Tombstones are intentionally retained and revisited: a previously signed upload can arrive late.
      await deleteGalleryTarget(row.expectedPublicId);
      await db.collection("uploadIntents").updateOne({ _id: row._id, state: { $in: ["rejected", "expired"] } }, { $set: { nextCheckAt: new Date(Date.now()+86400000), updatedAt: new Date() } }); processed++;
    } catch { failed++; await db.collection("uploadIntents").updateOne({ _id: row._id }, { $set: { nextCheckAt: new Date(Date.now()+300000) } }); }
  }
  const assets = await db.collection("assets").find({ state: { $in: ["delete_pending", "deleted"] }, nextCheckAt: { $lte: new Date() } }).sort({ nextCheckAt: 1 }).limit(3).toArray();
  for (const row of assets) {
    if (Date.now() > deadline) break;
    try {
      await deleteGalleryTarget(row.publicId);
      await db.client.withSession(session => session.withTransaction(async () => {
        const current = await db.collection("assets").findOne({ _id: row._id, state: { $in: ["delete_pending", "deleted"] } }, { session }); if (!current) return;
        if (current.state === "deleted") { await db.collection("assets").updateOne({ _id: current._id, state: "deleted" }, { $set: { nextCheckAt: new Date(Date.now()+86400000) } }, { session }); return; }
        const changed = await db.collection("weddings").updateOne({ _id: row.weddingId, "storage.usedBytes": { $gte: current.bytes } }, { $inc: { writeFence: Long.ONE, "storage.usedBytes": Long.fromValue(current.bytes).negate() } }, { session });
        if (!changed.modifiedCount) throw Error("Storage reconciliation required");
        await db.collection("assets").updateOne({ _id: row._id, state: "delete_pending" }, { $set: { state: "deleted", deletedAt: new Date(), nextCheckAt: new Date(Date.now()+86400000), updatedAt: new Date() } }, { session });
      }, { writeConcern: { w: "majority" } })); processed++;
    } catch { failed++; await db.collection("assets").updateOne({ _id: row._id, state: { $in: ["delete_pending", "deleted"] } }, { $set: { nextCheckAt: new Date(Date.now()+300000) } }); }
  }
  return { processed, failed };
}
