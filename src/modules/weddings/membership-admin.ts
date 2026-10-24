import "server-only";
import { Long, type ClientSession } from "mongodb";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "./service";
export async function adminTransaction<T>(
  user: User,
  weddingId: string,
  active: boolean,
  work: (
    session: ClientSession,
    wedding: import("mongodb").Document,
  ) => Promise<T>,
  requireVerified = active,
) {
  const db = await getDatabase();
  const membership = await membershipFor(user);
  if (
    !membership ||
    membership.status !== "active" ||
    membership.weddingId.toString() !== weddingId
  )
    throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const now = new Date();
        const wedding = await db.collection("weddings").findOneAndUpdate(
          {
            _id: membership.weddingId,
            ...(active ? { state: "active" } : {}),
          },
          { $inc: { writeFence: Long.ONE } },
          { session, returnDocument: "after" },
        );
        if (!wedding)
          throw new AccountError(
            409,
            "WEDDING_ARCHIVED",
            "This wedding is archived. This change is unavailable.",
          );
        const actor = await db.collection<User>("users").findOneAndUpdate(
          {
            _id: user._id,
            status: "active",
            credentialVersion: user.credentialVersion,
          },
          { $set: { updatedAt: now } },
          { session, returnDocument: "after" },
        );
        if (!actor)
          throw new AccountError(
            401,
            "UNAUTHENTICATED",
            "Please sign in again.",
          );
        const access = await db.collection("memberships").findOneAndUpdate(
          {
            userId: user._id,
            weddingId: wedding._id,
            status: "active",
            role: "ADMIN",
          },
          { $set: { updatedAt: now } },
          { session, returnDocument: "after" },
        );
        if (!access)
          throw new AccountError(
            403,
            "FORBIDDEN",
            "Only an administrator can manage family access.",
          );
        if (requireVerified && !actor.emailVerifiedAt)
          throw new AccountError(
            403,
            "EMAIL_NOT_VERIFIED",
            "Verify your email before sending invitations.",
          );
        return work(session, wedding);
      },
      { writeConcern: { w: "majority" } },
    ),
  );
}
