import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { adminTransaction } from "./membership-admin";

const versionSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});
const roleSchema = versionSchema.extend({ role: z.enum(["ADMIN", "MANAGER"]) });

export async function manageMember(
  user: User,
  weddingId: string,
  membershipId: string,
  action: "role" | "remove",
  payload: unknown,
) {
  const input =
    action === "role"
      ? roleSchema.parse(payload)
      : versionSchema.parse(payload);
  if (!/^[a-f0-9]{24}$/.test(membershipId))
    throw new AccountError(404, "NOT_FOUND", "Member unavailable.");
  const db = await getDatabase();
  // A shared wedding fence serializes all changes that could affect ADMIN count.
  return adminTransaction(
    user,
    weddingId,
    action === "role",
    async (session, wedding) => {
      const member = await db
        .collection("memberships")
        .findOne(
          { _id: new ObjectId(membershipId), weddingId: wedding._id },
          { session },
        );
      if (!member)
        throw new AccountError(404, "NOT_FOUND", "Member unavailable.");
      if (member.version !== input.expectedVersion)
        throw Object.assign(
          new AccountError(
            409,
            "VERSION_CONFLICT",
            "This member changed. Reload the latest members before retrying.",
          ),
          { currentVersion: member.version },
        );
      if (member.status !== "active")
        throw new AccountError(
          409,
          "MEMBER_REMOVED",
          "This person no longer has access. A fresh invitation is required to restore it.",
        );
      const role = "role" in input ? input.role : member.role;
      const reducesAdmins =
        member.role === "ADMIN" && (action === "remove" || role === "MANAGER");
      if (
        reducesAdmins &&
        (await db
          .collection("memberships")
          .countDocuments(
            { weddingId: wedding._id, status: "active", role: "ADMIN" },
            { session },
          )) <= 1
      )
        throw new AccountError(
          409,
          "LAST_ADMIN",
          "This wedding needs at least one administrator. Make another member an administrator before changing this role or removing access.",
        );
      if (action === "role" && role === member.role)
        return {
          id: member._id.toString(),
          userId: member.userId.toString(),
          role: member.role as string,
          status: "active",
          version: member.version as number,
        };
      const now = new Date();
      const updated = await db
        .collection("memberships")
        .findOneAndUpdate(
          {
            _id: member._id,
            weddingId: wedding._id,
            status: "active",
            version: input.expectedVersion,
          },
          {
            $set: {
              updatedAt: now,
              ...(action === "remove"
                ? { status: "removed", removedAt: now }
                : { role }),
            },
            $inc: { version: 1 },
          },
          { session, returnDocument: "after" },
        );
      if (!updated)
        throw new AccountError(
          409,
          "VERSION_CONFLICT",
          "This member changed. Reload the latest members before retrying.",
        );
      await db
        .collection("activity")
        .insertOne(
          {
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
            weddingId: wedding._id,
            actor: { type: "user", userId: user._id },
            action:
              action === "remove"
                ? "membership.removed"
                : "membership.role_changed",
            entityType: "membership",
            entityId: member._id,
            summary:
              action === "remove"
                ? "Wedding access removed"
                : "Family role updated",
            beforeVersion: member.version,
            afterVersion: updated.version,
            metadata: { beforeRole: member.role, afterRole: updated.role },
            occurredAt: now,
          },
          { session },
        );
      return {
        id: updated._id.toString(),
        userId: updated.userId.toString(),
        role: updated.role as string,
        status: updated.status as string,
        version: updated.version as number,
      };
    },
    false,
  );
}
