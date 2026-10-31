import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { body, cookieName, trustedMutation } from "@/modules/identity/http";
import { AccountError } from "@/modules/identity/security";
import { currentUser, rateLimit } from "@/modules/identity/service";
import { expenseFor, expenseSummary, listExpenses, saveExpense } from "./service";

export async function handleExpenses(request: NextRequest, action: "list" | "summary" | "detail" | "create" | "update" | "remove", weddingId: string, id?: string) {
  const requestId = randomUUID(), headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Request-Id": requestId };
  try {
    const mutation = ["create", "update", "remove"].includes(action);
    if (mutation) trustedMutation(request);
    const user = await currentUser(request.cookies.get(cookieName())?.value);
    if (!user) throw new AccountError(401, "UNAUTHENTICATED", "Please sign in to continue.");
    if (mutation) await rateLimit(`expense-${action}`, user._id.toString(), action === "create" ? 20 : 60);
    const query = Object.fromEntries(request.nextUrl.searchParams);
    if (action === "list") return NextResponse.json({ ...await listExpenses(user, weddingId, query), requestId }, { headers });
    const data = action === "summary" ? await expenseSummary(user, weddingId, query) : action === "detail" ? await expenseFor(user, weddingId, id!) : await saveExpense(user, weddingId, action === "create" ? null : id!, await body(request, 65536), request.headers.get("idempotency-key"), action === "remove", request.headers.get("x-mmm-wedding-timezone"));
    if (!data) throw new AccountError(404, "NOT_FOUND", "Expense unavailable.");
    return NextResponse.json({ data, requestId }, { status: action === "create" ? 201 : 200, headers });
  } catch (error) {
    const validation = error instanceof z.ZodError, known = error instanceof AccountError;
    const status = validation ? 422 : known ? error.status : 503;
    return NextResponse.json({ error: {
      code: validation ? "VALIDATION_ERROR" : known ? error.code : "EXPENSES_UNAVAILABLE",
      message: validation ? "Please check the highlighted fields." : known ? error.message : "Expenses are temporarily unavailable. Please retry.",
      ...(validation ? { fields: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) } : {}),
      ...(known && "currentVersion" in error ? { currentVersion: error.currentVersion } : {}),
    }, requestId }, { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "900" } : {}) } });
  }
}
