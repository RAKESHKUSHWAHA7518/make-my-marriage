import "server-only";
import { Long, type ClientSession } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
const missing = () => new AccountError(404,"MEDIA_UNAVAILABLE","Photo or upload unavailable.");
export async function mediaReady() {
  const db = await getDatabase();
  for (const [name, index] of [["assets", "media_gallery"], ["uploadIntents", "media_operation"]]) {
    if (!await db.listCollections({ name }).hasNext() || !(await db.collection(name).indexes()).some(i => i.name === index)) throw new AccountError(503, "MEDIA_NOT_READY", "The gallery is not activated in this environment yet.");
  }
}
export async function galleryFamilyAccess(user: User, session?: ClientSession, mutate = false) {
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
