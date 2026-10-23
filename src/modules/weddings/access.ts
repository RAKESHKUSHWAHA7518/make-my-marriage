import "server-only";
import { ObjectId, type Document } from "mongodb";
import { z } from "zod";
import { getDatabase } from "@/infrastructure/mongodb/client";
import { AccountError } from "@/modules/identity/security";
import type { User } from "@/modules/identity/service";
import { membershipFor } from "./service";

const querySchema = z.strictObject({
  status: z.enum(["active", "removed"]).optional(),
  role: z.enum(["ADMIN", "MANAGER"]).optional(),
  state: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().max(1500).optional(),
});

export async function listWeddingAccess(
  user: User,
  weddingId: string,
  kind: "members" | "invitations",
  query: unknown = {},
) {
  const db = await getDatabase();
  const access = await membershipFor(user);
  if (
    !access ||
    access.status !== "active" ||
    access.weddingId.toString() !== weddingId
  )
    throw new AccountError(404, "NOT_FOUND", "Wedding unavailable.");
  if (kind === "invitations" && access.role !== "ADMIN")
    throw new AccountError(
      403,
      "FORBIDDEN",
      "An administrator manages family invitations.",
    );
  const input = querySchema.parse(query);
  if (
    (kind === "members" && input.state) ||
    (kind === "invitations" && (input.role || input.status))
  )
    throw new AccountError(
      400,
      "INVALID_FILTER",
      "Choose filters appropriate to this list.",
    );
  const filter: Document = { weddingId: access.weddingId };
  if (input.status) filter.status = input.status;
  if (input.role) filter.role = input.role;
  const now = new Date();
  if (input.state === "pending") {
    filter.state = "pending";
    filter.expiresAt = { $gt: now };
  } else if (input.state === "expired")
    filter.$or = [
      { state: "expired" },
      { state: "pending", expiresAt: { $lte: now } },
    ];
  else if (input.state) filter.state = input.state;
  const scope = JSON.stringify([
    kind,
    weddingId,
    input.status ?? "",
    input.role ?? "",
    input.state ?? "",
  ]);
  if (input.cursor) {
    try {
      const cursor = JSON.parse(
        Buffer.from(input.cursor, "base64url").toString("utf8"),
      );
      if (cursor.scope !== scope || !/^[a-f0-9]{24}$/.test(cursor.id))
        throw Error();
      filter._id = { $lt: new ObjectId(cursor.id) };
    } catch {
      throw new AccountError(
        400,
        "INVALID_CURSOR",
        "This list cursor is invalid. Reload the list.",
      );
    }
  }
  // Safe projections are enforced before joining account details.
  const rows = await db
    .collection(kind === "members" ? "memberships" : "membershipInvites")
    .find(filter, {
      projection:
        kind === "members"
          ? { userId: 1, role: 1, status: 1, joinedAt: 1, version: 1 }
          : { emailNormalized: 1, role: 1, state: 1, expiresAt: 1, version: 1 },
    })
    .sort({ _id: -1 })
    .limit(input.limit + 1)
    .toArray();
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  const users =
    kind === "members"
      ? await db
          .collection("users")
          .find(
            { _id: { $in: page.map((row) => row.userId) } },
            { projection: { displayName: 1, email: 1 } },
          )
          .toArray()
      : [];
  const accounts = new Map(users.map((row) => [row._id.toString(), row]));
  return {
    data: page.map((row) =>
      kind === "members"
        ? {
            id: row._id.toString(),
            userId: row.userId.toString(),
            role: row.role as "ADMIN" | "MANAGER",
            status: row.status as "active" | "removed",
            version: row.version as number,
            displayName: accounts.get(row.userId.toString())?.displayName as
              | string
              | undefined,
            email: accounts.get(row.userId.toString())?.email as
              | string
              | undefined,
            joinedAt: (row.joinedAt as Date).toISOString(),
          }
        : {
            id: row._id.toString(),
            email: row.emailNormalized as string,
            role: row.role as "ADMIN" | "MANAGER",
            state: (row.state === "pending" && row.expiresAt <= now
              ? "expired"
              : row.state) as "pending" | "accepted" | "revoked" | "expired",
            expiresAt: (row.expiresAt as Date).toISOString(),
            version: row.version as number,
          },
    ),
    pagination: {
      hasMore,
      nextCursor: hasMore
        ? Buffer.from(
            JSON.stringify({ scope, id: page.at(-1)!._id.toString() }),
          ).toString("base64url")
        : null,
    },
  };
}
