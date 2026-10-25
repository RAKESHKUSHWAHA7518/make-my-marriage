import "server-only";
import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { sendAccountEmails } from "@/infrastructure/resend/account-mail";
import { z } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { listWeddingAccess } from "./access";
import { manageMember } from "./members";
import { createEvent, updateEvent, eventFor, listEvents } from "@/modules/events/service";
import {
  inviteFamily,
  revokeFamilyInvitation,
  inspectInvitation,
  acceptInvitation,
} from "./invitations";
import {
  createWedding,
  currentWedding,
  weddingFor,
  updateWedding,
} from "./service";

export async function handleWedding(
  request: NextRequest,
  action:
    | "create"
    | "current"
    | "settings"
    | "update"
    | "members"
    | "invitations"
    | "invite"
    | "revoke"
    | "preview-invite"
    | "accept-invite"
    | "change-role"
    | "remove-member"
    | "list-events"
    | "create-event"
    | "event-detail"
    | "update-event",
  id?: string,
  inviteId?: string,
) {
  const requestId = randomUUID();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
  };
  try {
    const mutation = [
      "create",
      "update",
      "invite",
      "revoke",
      "preview-invite",
      "accept-invite",
      "change-role",
      "remove-member",
      "create-event",
      "update-event",
    ].includes(action);
    if (mutation) trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user)
      throw new AccountError(
        401,
        "UNAUTHENTICATED",
        "Please sign in to continue.",
      );
    if (mutation)
      await rateLimit(
        `wedding-${action}`,
        user._id.toString(),
        ["create", "invite", "create-event"].includes(action) ? 20 : 60,
      );
    if (action === "list-events") {
      const result = await listEvents(user, id!, Object.fromEntries(request.nextUrl.searchParams));
      return NextResponse.json({ ...result, requestId }, { headers });
    }
    if (action === "event-detail") {
      const result = await eventFor(user, id!, inviteId!);
      if (!result) throw new AccountError(404, "NOT_FOUND", "Event unavailable.");
      return NextResponse.json({ data: result, requestId }, { headers });
    }
    if (action === "members" || action === "invitations") {
      const result = await listWeddingAccess(
        user,
        id!,
        action,
        Object.fromEntries(request.nextUrl.searchParams),
      );
      return NextResponse.json({ ...result, requestId }, { headers });
    }
    const data =
      action === "update-event"
        ? await updateEvent(user, id!, inviteId!, await body(request), request.headers.get("idempotency-key"), request.headers.get("x-mmm-wedding-timezone"))
        : action === "create-event"
        ? await createEvent(user, id!, await body(request), request.headers.get("idempotency-key"), request.headers.get("x-mmm-wedding-timezone"))
        : action === "change-role" || action === "remove-member"
        ? await manageMember(
            user,
            id!,
            inviteId!,
            action === "change-role" ? "role" : "remove",
            await body(request),
          )
        : action === "invite"
          ? await inviteFamily(user, id!, await body(request))
          : action === "revoke"
            ? await revokeFamilyInvitation(
                user,
                id!,
                inviteId!,
                await body(request),
              )
            : action === "preview-invite"
              ? await inspectInvitation(user, await body(request))
              : action === "accept-invite"
                ? await acceptInvitation(user, await body(request))
                : action === "create"
                  ? await createWedding(
                      user,
                      await body(request),
                      request.headers.get("idempotency-key"),
                    )
                  : action === "update"
                    ? await updateWedding(user, id!, await body(request))
                    : action === "current"
                      ? await currentWedding(user)
                      : await weddingFor(user, id);
    if (action === "invite")
      after(async () => {
        try {
          await sendAccountEmails();
        } catch {
          // The durable job remains available to the scheduled retry worker.
          console.warn("INVITATION_MAIL_RETRY_PENDING");
        }
      });
    return NextResponse.json(
      { data, requestId },
      { status: ["create", "invite", "create-event"].includes(action) ? 201 : 200, headers },
    );
  } catch (error) {
    const validation = error instanceof z.ZodError;
    const known = error instanceof AccountError;
    const status = validation ? 422 : known ? error.status : 503;
    return NextResponse.json(
      {
        error: {
          ...(known && "currentVersion" in error
            ? { currentVersion: error.currentVersion }
            : {}),
          code: validation
            ? "VALIDATION_ERROR"
            : known
              ? error.code
              : "SERVICE_UNAVAILABLE",
          message: validation
            ? "Please check the highlighted fields."
            : known
              ? error.message
              : "Wedding services are temporarily unavailable. Please retry.",
          ...(validation
            ? {
                fields: error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  message: issue.message,
                })),
              }
            : {}),
        },
        requestId,
      },
      {
        status,
        headers: {
          ...headers,
          ...(status === 429 ? { "Retry-After": "900" } : {}),
        },
      },
    );
  }
}
