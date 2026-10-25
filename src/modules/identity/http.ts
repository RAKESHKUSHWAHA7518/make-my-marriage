import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { schemas } from "./schemas";
import { ensureAccountIndexes } from "@/infrastructure/mongodb/account-readiness";
import { AccountError, SESSION_SECONDS, origin } from "./security";
import {
  consumeToken,
  currentUser,
  identity,
  login,
  logout,
  rateLimit,
  register,
  requestEmail,
} from "./service";

import { sendAccountEmails } from "@/infrastructure/resend/account-mail";

export const cookieName = () =>
  origin().startsWith("https:") ? "__Host-mmm_session" : "mmm_session";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: origin().startsWith("https:"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
});
export function trustedMutation(request: Request) {
  if (
    request.headers.get("origin") !== origin() ||
    request.headers.get("x-mmm-csrf") !== "1" ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AccountError(
      403,
      "UNTRUSTED_REQUEST",
      "Please reload this page and try again.",
    );
  }
}
export function authorizedScheduler(request: Request) {
  const expected = process.env.CRON_SECRET;
  const received = request.headers.get("authorization") ?? "";
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(`Bearer ${expected}`),
    b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function body(request: Request, maxBytes = 8192) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AccountError(400, "INVALID_CONTENT_TYPE", "Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new AccountError(400, "INVALID_JSON", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AccountError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
    }
    chunks.push(next.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AccountError(400, "INVALID_JSON", "Invalid JSON.");
  }
}

export async function handleAccount(
  request: NextRequest,
  action: keyof typeof schemas | "me",
) {
  const requestId = randomUUID();
  try {
    let response: NextResponse;
    const raw = request.cookies.get(cookieName())?.value;
    if (action === "me") {
      const user = await currentUser(raw);
      if (!user)
        throw new AccountError(
          401,
          "UNAUTHENTICATED",
          "Please sign in to continue.",
        );
      response = NextResponse.json({ data: await identity(user), requestId });
    } else {
      trustedMutation(request);
      await ensureAccountIndexes();
      // Vercel overwrites this header. Locally use a shared bucket, not a spoofable client header.
      const ip = process.env.VERCEL
        ? (request.headers
            .get("x-vercel-forwarded-for")
            ?.split(",")[0]
            ?.trim() ?? "unknown")
        : "local";
      await rateLimit("auth-total", "global", 1000);
      await rateLimit(action, `ip:${ip}`, 60);
      const input = schemas[action].parse(await body(request));
      if ("email" in input)
        await rateLimit(
          action,
          `email:${input.email.toLowerCase()}`,
          action === "login" ? 10 : 5,
        );
      let data: unknown;
      let status = 200;
      let sessionToken: string | undefined;
      switch (action) {
        case "register":
          data = await register(schemas.register.parse(input));
          status = 202;
          break;
        case "login": {
          const value = schemas.login.parse(input);
          const result = await login(value.email, value.password, raw);
          sessionToken = result.raw;
          data = result.data;
          break;
        }
        case "forgot-password":
          data = await requestEmail(
            schemas["forgot-password"].parse(input).email,
            "reset_password",
          );
          status = 202;
          break;
        case "resend-verification":
          data = await requestEmail(
            schemas["resend-verification"].parse(input).email,
            "verify_email",
          );
          status = 202;
          break;
        case "verify-email":
          data = await consumeToken(
            schemas["verify-email"].parse(input).token,
            "verify_email",
          );
          break;
        case "reset-password": {
          const value = schemas["reset-password"].parse(input);
          data = await consumeToken(
            value.token,
            "reset_password",
            value.newPassword,
          );
          break;
        }
        case "logout":
          await logout(raw);
          status = 204;
          break;
      }
      if (status === 202)
        after(async () => {
          try {
            await sendAccountEmails();
          } catch {
            console.warn("ACCOUNT_MAIL_RETRY_PENDING");
          }
        });
      response =
        status === 204
          ? new NextResponse(null, { status })
          : NextResponse.json({ data, requestId }, { status });
      if (sessionToken)
        response.cookies.set(cookieName(), sessionToken, cookieOptions());
      if (action === "logout" || action === "reset-password")
        response.cookies.set(cookieName(), "", {
          ...cookieOptions(),
          maxAge: 0,
        });
    }
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    const validation = error instanceof z.ZodError;
    const known = error instanceof AccountError;
    const status = validation ? 422 : known ? error.status : 503;
    return NextResponse.json(
      {
        error: {
          code: validation
            ? "VALIDATION_ERROR"
            : known
              ? error.code
              : "SERVICE_UNAVAILABLE",
          message: validation
            ? "Please check the highlighted fields."
            : known
              ? error.message
              : "Account services are temporarily unavailable. Please try again later.",
          ...(validation
            ? {
                fields: error.issues.map((i) => ({
                  path: i.path.join("."),
                  message: i.message,
                })),
              }
            : {}),
        },
        requestId,
      },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-Id": requestId,
          ...(status === 429 ? { "Retry-After": "900" } : {}),
        },
      },
    );
  }
}
