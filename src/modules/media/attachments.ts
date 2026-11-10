import "server-only";
import { ObjectId, type ClientSession, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { galleryFamilyAccess } from "@/modules/media/access";
import { attachmentTargets, type AttachmentFormat, type AttachmentPurpose } from "./attachment-policy";

const missing = () => new AccountError(404, "ATTACHMENT_UNAVAILABLE", "File or linked record unavailable.");
const versionSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
const objectId = (value: string) => {
  if (!/^[a-f0-9]{24}$/.test(value)) throw missing();
  return new ObjectId(value);
};

export async function privateAttachmentsReady(purpose: AttachmentPurpose) {
  const target = attachmentTargets[purpose];
  const db = await getDatabase();
  const [assets, intents] = await Promise.all(["assets", "uploadIntents"].map(name => db.listCollections({ name }, { nameOnly: false }).next()));
  const branch = assets?.options?.validator?.$or?.some((item: Document) => item.$jsonSchema?.properties?.purpose?.enum?.includes(purpose));
  const rules = intents?.options?.validator?.$jsonSchema;
  if (!branch || !rules?.properties?.purpose?.enum?.includes(purpose) || !rules.properties[target.context] || !rules.properties.attachmentFormat) {
    throw new AccountError(503, "ATTACHMENTS_NOT_READY", `${target.label} uploads are awaiting activation.`);
  }
}

export async function attachmentRecord(purpose: AttachmentPurpose, weddingId: ObjectId, resourceId: ObjectId, session?: ClientSession) {
  const target = attachmentTargets[purpose];
  const record = await (await getDatabase()).collection(target.collection).findOne({ _id: resourceId, weddingId, ...(purpose === "receipt" ? { deletedAt: { $exists: false } } : {}) }, { session, projection: { [target.field]: 1 } });
  if (!record) throw missing();
  return { id: record._id, files: record[target.field] as ObjectId[] };
}

export async function updateAttachmentLink(purpose: AttachmentPurpose, weddingId: ObjectId, resourceId: ObjectId, assetId: ObjectId, attach: boolean, now: Date, session: ClientSession) {
  const target = attachmentTargets[purpose];
  const field = { [target.field]: assetId };
  const collection = (await getDatabase()).collection<{ attachmentAssetIds?: ObjectId[]; receiptAssetIds?: ObjectId[]; version: number; updatedAt: Date; weddingId: ObjectId }>(target.collection);
  await collection.updateOne({ _id: resourceId, weddingId }, {
    ...(attach ? { $push: field } : { $pull: field }), $inc: { version: 1 }, $set: { updatedAt: now },
  }, { session });
}

function view(asset: Document) {
  return { id: asset._id.toString() as string, filename: asset.filename as string, format: asset.format as AttachmentFormat, bytes: asset.bytes.toString() as string, version: asset.version as number };
}
export type PrivateAttachment = ReturnType<typeof view>;

export async function listPrivateAttachments(user: User, purpose: AttachmentPurpose, weddingId: string, resourceId: string) {
  const wedding = await galleryFamilyAccess(user);
  if (wedding._id.toString() !== weddingId) throw missing();
  const record = await attachmentRecord(purpose, wedding._id, objectId(resourceId));
  await privateAttachmentsReady(purpose);
  const rows = await (await getDatabase()).collection("assets").find({
    _id: { $in: record.files }, weddingId: wedding._id, [attachmentTargets[purpose].context]: record.id, purpose, state: "ready",
  }).sort({ createdAt: -1, _id: -1 }).toArray();
  return { files: rows.map(view), readOnly: wedding.state !== "active" };
}

export async function assertPrivateAttachmentLinked(purpose: AttachmentPurpose, asset: Document, session?: ClientSession) {
  const record = await attachmentRecord(purpose, asset.weddingId, asset[attachmentTargets[purpose].context], session);
  if (!record.files.some(id => id.equals(asset._id))) throw missing();
}

export async function removePrivateAttachment(user: User, purpose: AttachmentPurpose, weddingId: string, resourceId: string, assetId: string, payload: unknown) {
  const { expectedVersion } = versionSchema.parse(payload);
  await privateAttachmentsReady(purpose);
  const target = attachmentTargets[purpose];
  const db = await getDatabase();
  return db.client.withSession(session => session.withTransaction(async () => {
    const wedding = await galleryFamilyAccess(user, session, true);
    if (wedding._id.toString() !== weddingId) throw missing();
    const record = await attachmentRecord(purpose, wedding._id, objectId(resourceId), session);
    const scope = { _id: objectId(assetId), weddingId: wedding._id, [target.context]: record.id, purpose };
    const asset = await db.collection("assets").findOne(scope, { session });
    if (!asset) throw missing();
    if (["delete_pending", "deleted"].includes(asset.state) && asset.version === expectedVersion + 1) return { id: assetId, removed: true };
    if (wedding.state !== "active") throw new AccountError(409, "WEDDING_ARCHIVED", "This wedding is archived. Attachments are read-only.");
    if (asset.state !== "ready" || asset.version !== expectedVersion || !record.files.some(id => id.equals(asset._id))) {
      throw new AccountError(409, "VERSION_CONFLICT", "This attachment changed. Reload attachments before trying again.");
    }
    const now = new Date();
    await updateAttachmentLink(purpose, wedding._id, record.id, asset._id, false, now, session);
    await db.collection("assets").updateOne(scope, { $set: { state: "delete_pending", nextCheckAt: now, updatedAt: now }, $inc: { version: 1 } }, { session });
    await db.collection("activity").insertOne({ weddingId: wedding._id, actor: { type: "user", userId: user._id }, entityType: "asset", entityId: asset._id, action: `${target.action}.removed`, summary: `${target.label} removed`, occurredAt: now, schemaVersion: 1, createdAt: now, updatedAt: now }, { session });
    return { id: assetId, removed: true };
  }, { writeConcern: { w: "majority" } }));
}
