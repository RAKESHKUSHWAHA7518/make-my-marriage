import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { currentUser, rateLimit } from "@/modules/identity/service";
import {
  createWedding,
  currentWedding,
  weddingFor,
  updateWedding,
} from "./service";

export async function handleWedding(
  request: NextRequest,
  action: "create" | "current" | "settings" | "update",
  id?: string,
) {
  const requestId = randomUUID();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
  };
  try {
    if (action === "create" || action === "update") trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user)
      throw new AccountError(
        401,
        "UNAUTHENTICATED",
        "Please sign in to continue.",
      );
    if (action === "create" || action === "update")
      await rateLimit(
        `wedding-${action}`,
        user._id.toString(),
        action === "create" ? 20 : 60,
      );
    const data =
      action === "create"
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
    return NextResponse.json(
      { data, requestId },
      { status: action === "create" ? 201 : 200, headers },
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
