import "server-only";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError } from "@/modules/identity/security";
import { householdInvitationGrant } from "@/modules/guest-access/service";
import { createDesignSchema, designId, type DesignInput } from "./schema";
import { versionEligible } from "./publication";

/** No version history, internal asset IDs or provider URLs in the guest DTO. */
export async function guestCard(raw: string | undefined, expectedVersion?: string) {
  const { household, wedding } = await householdInvitationGrant(raw);
  if (!household.designVersionId || (expectedVersion && (!designId.safeParse(expectedVersion).success || household.designVersionId.toString() !== expectedVersion))) return null;
  const row = await (await getDatabase()).collection("designVersions").findOne({ _id: household.designVersionId, weddingId: wedding._id });
  if (!row || !await versionEligible(wedding._id, household, row)) return null;
  const content = createDesignSchema.parse(row.content);
  const safe: Pick<DesignInput, "mode" | "draft"> = { mode: content.mode, draft: content.mode === "template" ? content.draft : { assetIds: [] } };
  return { id: row._id.toString(), ...safe };
}
export async function guestCardAsset(raw: string | undefined, version: string) {
  const safe = await guestCard(raw, version);
  if (!safe || safe.mode !== "uploaded_image") throw new AccountError(404, "CARD_UNAVAILABLE", "Invitation artwork unavailable.");
  const { household, wedding } = await householdInvitationGrant(raw), db = await getDatabase();
  if (household.designVersionId?.toString() !== version) throw new AccountError(404, "CARD_UNAVAILABLE", "Invitation artwork unavailable.");
  const row = await db.collection("designVersions").findOne({ _id: new ObjectId(version), weddingId: wedding._id });
  if (!row || !await versionEligible(wedding._id, household, row)) throw new AccountError(404, "CARD_UNAVAILABLE", "Invitation artwork unavailable.");
  const asset = await db.collection("assets").findOne({ _id: new ObjectId(row.content.draft.assetIds[0]), weddingId: wedding._id, purpose: "invitation", visibility: "family", state: "ready", audienceEventIds: { $size: row.eventIds.length, ...(row.eventIds.length ? { $all: row.eventIds } : {}) } });
  if (!asset) throw new AccountError(404, "CARD_UNAVAILABLE", "Invitation artwork unavailable.");
  return asset;
}
