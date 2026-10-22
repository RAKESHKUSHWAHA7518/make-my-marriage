import "../scripts/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { Webhook } from "svix";
import {
  getDatabase,
  closeDatabase,
} from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import {
  register,
  login,
  currentUser,
  logout,
  requestEmail,
  consumeToken,
  rateLimit,
  type User,
} from "../src/modules/identity/service";
import {
  decrypt,
  encrypt,
  digest,
  randomToken,
  hashPassword,
  type Encrypted,
} from "../src/modules/identity/security";
import { schemas } from "../src/modules/identity/schemas";
import { handleAccount } from "../src/modules/identity/http";
import { sendAccountEmails } from "../src/infrastructure/resend/account-mail";
import { reconcileReceipts } from "../src/infrastructure/resend/receipts";
import { POST as webhook } from "../src/app/api/webhooks/resend/route";

test("account journey, security and durable email against isolated MongoDB", async (t) => {
  const actualDatabase = process.env.MONGODB_DB_NAME;
  const testDatabase = `mmm_auth_test_${randomBytes(8).toString("hex")}`;
  process.env.MONGODB_DB_NAME = testDatabase;
  process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.ACCOUNT_EMAIL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.RESEND_API_KEY = "test-provider-never-sent";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${randomBytes(32).toString("base64")}`;
  const db = await getDatabase();
  const originalFetch = globalThis.fetch;
  const password = "a-long-sample-passphrase";
  async function tokenFor(email: string, kind: string) {
    const user = await db
      .collection("users")
      .findOne({ emailNormalized: email });
    const delivery = await db
      .collection("deliveries")
      .findOne({ userId: user!._id, kind }, { sort: { createdAt: -1 } });
    const payload = JSON.parse(
      decrypt(delivery!.payloadEncrypted as Encrypted),
    );
    return /#token=([A-Za-z0-9_-]+)/.exec(payload.text)![1];
  }
  try {
    await migrateAccounts(db);
    await migrateAccounts(db);
    await t.test(
      "strict contracts reject extra fields and overlong passwords",
      () => {
        assert.equal(
          schemas.register.safeParse({
            displayName: "Test",
            email: "a@example.com",
            password,
            role: "ADMIN",
          }).success,
          false,
        );
        assert.equal(
          schemas.register.safeParse({
            displayName: "Test",
            email: "a@example.com",
            password: "x".repeat(129),
          }).success,
          false,
        );
      },
    );
    await t.test(
      "concurrent registration is unique; email intent commits atomically",
      async () => {
        const input = {
          displayName: "Test User",
          email: "Person@example.com",
          password,
        };
        const results = await Promise.all([
          register(input),
          register({ ...input, email: "person@example.com" }),
        ]);
        assert.deepEqual(results[0], results[1]);
        assert.equal(await db.collection("users").countDocuments({}), 1);
        assert.equal(await db.collection("deliveries").countDocuments({}), 1);
        assert.equal(await db.collection("jobs").countDocuments({}), 1);
        const user = await db.collection("users").findOne({});
        assert.match(user!.passwordHash, /^\$argon2id\$/);
        const raw = await tokenFor("person@example.com", "verify_email");
        const stored = await db.collection("authTokens").findOne({});
        assert.equal(stored!.tokenHash, digest(raw));
        assert.equal(
          JSON.stringify(
            await db.collection("deliveries").findOne({}),
          ).includes(raw),
          false,
        );
      },
    );
    await t.test(
      "unverified login allowed; verification creates no session and cannot replay",
      async () => {
        const signedIn = await login("PERSON@example.com", password);
        assert.equal(signedIn.data.user.emailVerified, false);
        assert.equal(signedIn.data.membership, null);
        const raw = await tokenFor("person@example.com", "verify_email");
        await consumeToken(raw, "verify_email");
        await assert.rejects(consumeToken(raw, "verify_email"));
        assert.equal(await db.collection("sessions").countDocuments({}), 1);
        assert.ok((await currentUser(signedIn.raw))!.emailVerifiedAt);
      },
    );
    await t.test(
      "invalid login and unknown address share the same failure",
      async () => {
        await assert.rejects(login("person@example.com", "incorrect"), {
          message: "Email or password is incorrect.",
        });
        await assert.rejects(login("absent@example.com", password), {
          message: "Email or password is incorrect.",
        });
      },
    );
    await t.test(
      "session rotation, logout and expiry are enforced before TTL cleanup",
      async () => {
        const old = await login("person@example.com", password);
        const next = await login("person@example.com", password, old.raw);
        assert.equal(await currentUser(old.raw), null);
        await logout(next.raw);
        await logout(next.raw);
        assert.equal(await currentUser(next.raw), null);
        const expired = await login("person@example.com", password);
        await db
          .collection("sessions")
          .updateOne(
            { tokenHash: digest(expired.raw) },
            { $set: { expiresAt: new Date(0) } },
          );
        assert.equal(await currentUser(expired.raw), null);
      },
    );
    await t.test(
      "reset consumption is atomic and invalidates all prior sessions",
      async () => {
        const old = await login("person@example.com", password);
        assert.deepEqual(
          await requestEmail("person@example.com", "reset_password"),
          await requestEmail("absent@example.com", "reset_password"),
        );
        const raw = await tokenFor("person@example.com", "reset_password");
        await assert.rejects(consumeToken(raw, "verify_email"));
        const results = await Promise.allSettled([
          consumeToken(raw, "reset_password", password + "-new"),
          consumeToken(raw, "reset_password", password + "-new"),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(await currentUser(old.raw), null);
        await assert.rejects(login("person@example.com", password));
        await login("person@example.com", password + "-new");
      },
    );
    await t.test("disabled users and expired reset links fail", async () => {
      const session = await login("person@example.com", password + "-new");
      await db
        .collection("users")
        .updateOne({}, { $set: { status: "disabled" } });
      assert.equal(await currentUser(session.raw), null);
      await assert.rejects(login("person@example.com", password + "-new"));
      await db
        .collection("users")
        .updateOne({}, { $set: { status: "active" } });
      await requestEmail("person@example.com", "reset_password");
      const raw = await tokenFor("person@example.com", "reset_password");
      await db
        .collection("authTokens")
        .updateOne(
          { tokenHash: digest(raw) },
          { $set: { expiresAt: new Date(0) } },
        );
      await assert.rejects(consumeToken(raw, "reset_password", password));
    });
    await t.test(
      "persistent rate limiting is shared across concurrent calls",
      async () => {
        const results = await Promise.allSettled(
          Array.from({ length: 5 }, () => rateLimit("test", "subject", 2)),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
      },
    );
    await t.test(
      "HTTP rejects foreign origins, missing CSRF header and unknown fields",
      async () => {
        const request = (origin: string, csrf: string, extra = {}) =>
          new NextRequest("http://localhost:3001/api/v1/auth/login", {
            method: "POST",
            headers: {
              origin,
              "X-MMM-CSRF": csrf,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: "person@example.com",
              password: password + "-new",
              ...extra,
            }),
          });
        assert.equal(
          (await handleAccount(request("https://other.example", "1"), "login"))
            .status,
          403,
        );
        assert.equal(
          (await handleAccount(request("http://localhost:3001", ""), "login"))
            .status,
          403,
        );
        assert.equal(
          (
            await handleAccount(
              request("http://localhost:3001", "1", { admin: true }),
              "login",
            )
          ).status,
          422,
        );
        const response = await handleAccount(
          request("http://localhost:3001", "1"),
          "login",
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
        assert.match(response.headers.get("set-cookie")!, /SameSite=lax/i);
        assert.equal(
          response.headers.get("cache-control"),
          "private, no-store",
        );
        assert.equal(
          JSON.stringify(await response.json()).includes("tokenHash"),
          false,
        );
      },
    );
    await t.test(
      "missing mail configuration creates no account or false success",
      async () => {
        const key = process.env.RESEND_API_KEY;
        delete process.env.RESEND_API_KEY;
        await assert.rejects(
          register({
            displayName: "Missing",
            email: "missing@example.com",
            password,
          }),
        );
        assert.equal(
          await db
            .collection("users")
            .countDocuments({ emailNormalized: "missing@example.com" }),
          0,
        );
        process.env.RESEND_API_KEY = key;
      },
    );
    await t.test(
      "queued email retries retain immutable payload and idempotency key",
      async () => {
        await db
          .collection("jobs")
          .updateMany({}, { $set: { state: "cancelled" } });
        await register({
          displayName: "Mail",
          email: "mail@example.com",
          password,
        });
        const attempts: { key: string; body: string }[] = [];
        globalThis.fetch = async (_url, options) => {
          attempts.push({
            key: (options!.headers as Record<string, string>)[
              "Idempotency-Key"
            ],
            body: options!.body as string,
          });
          return attempts.length === 1
            ? new Response("{}", { status: 503 })
            : Response.json({ id: "test-provider-message" });
        };
        await sendAccountEmails();
        await db
          .collection("jobs")
          .updateMany({ state: "retry" }, { $set: { runAt: new Date(0) } });
        await sendAccountEmails();
        assert.equal(attempts.length, 2);
        assert.deepEqual(attempts[0], attempts[1]);
        const delivery = await db
          .collection("deliveries")
          .findOne({ providerMessageId: "test-provider-message" });
        assert.equal(delivery!.submissionState, "accepted");
        assert.equal(delivery!.payloadEncrypted, undefined);
        globalThis.fetch = originalFetch;
      },
    );
    await t.test(
      "signed bounce webhook is idempotent and blocks later email",
      async () => {
        const now = new Date();
        const id = randomToken();
        const payload = JSON.stringify({
          type: "email.bounced",
          created_at: now.toISOString(),
          data: { email_id: "test-provider-message" },
        });
        const signature = new Webhook(process.env.RESEND_WEBHOOK_SECRET!).sign(
          id,
          now,
          payload,
        );
        const request = (sig: string) =>
          new NextRequest("http://localhost:3001/api/webhooks/resend", {
            method: "POST",
            headers: {
              "svix-id": id,
              "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
              "svix-signature": sig,
            },
            body: payload,
          });
        assert.equal((await webhook(request("invalid"))).status, 400);
        assert.equal((await webhook(request(signature))).status, 204);
        assert.equal((await webhook(request(signature))).status, 204);
        assert.equal(
          await db.collection("webhookReceipts").countDocuments({}),
          1,
        );
        await requestEmail("mail@example.com", "verify_email");
        globalThis.fetch = async () => {
          throw new Error("Suppressed address must never be called");
        };
        await sendAccountEmails();
        const user = await db
          .collection<User>("users")
          .findOne({ emailNormalized: "mail@example.com" });
        const last = await db
          .collection("deliveries")
          .findOne({ userId: user!._id }, { sort: { createdAt: -1 } });
        assert.equal(last!.submissionState, "suppressed");
      },
    );
    await t.test("unmatched callbacks cannot starve later receipts and eventually expire", async () => {
      const receipts = db.collection("webhookReceipts");
      const now = new Date();
      const receipt = (id: string, emailId: string, receivedAt: Date) => ({
        provider: "resend", providerEventId: id, eventType: "email.delivered",
        payloadHash: digest(id), payloadEncrypted: encrypt(JSON.stringify({ emailId, occurredAt: now.toISOString() })),
        receivedAt, state: "received", schemaVersion: 1, createdAt: receivedAt, updatedAt: receivedAt,
      });
      await receipts.insertMany(Array.from({ length: 20 }, (_, i) => receipt(`unmatched-${i}`, `other-message-${i}`, new Date(now.getTime() - 60000))));
      await receipts.insertOne(receipt("later-valid", "test-provider-message", now));
      await reconcileReceipts();
      assert.equal(await receipts.countDocuments({ providerEventId: /^unmatched-/, nextAttemptAt: { $gt: now } }), 20);
      await reconcileReceipts();
      assert.equal((await receipts.findOne({ providerEventId: "later-valid" }))!.state, "processed");
      // A callback that raced ahead of acceptance must remain recoverable.
      await receipts.updateOne({ providerEventId: "unmatched-0" }, { $set: {
        nextAttemptAt: new Date(0),
        payloadEncrypted: encrypt(JSON.stringify({ emailId: "test-provider-message", occurredAt: now.toISOString() })),
      } });
      await reconcileReceipts();
      assert.equal((await receipts.findOne({ providerEventId: "unmatched-0" }))!.state, "processed");
      await receipts.updateMany({ providerEventId: /^unmatched-/, state: "received" }, { $set: { receivedAt: new Date(Date.now() - 49 * 3600000), nextAttemptAt: new Date(0) } });
      await reconcileReceipts();
      assert.equal(await receipts.countDocuments({ state: "failed", lastErrorCode: "UNMATCHED_DELIVERY", payloadEncrypted: { $exists: false }, purgeAt: { $type: "date" } }), 19);
    });
    await t.test("lost provider responses stay unknown when tokens expire or are consumed", async () => {
      for (const reason of ["expired", "consumed"] as const) {
        await db.collection("jobs").updateMany({}, { $set: { state: "cancelled" } });
        await register({ displayName: "Timeout", email: `timeout-${reason}@example.com`, password });
        const delivery = await db.collection("deliveries").findOne({ submissionState: "queued" }, { sort: { createdAt: -1 } });
        assert.ok(delivery);
        let attempts = 0;
        globalThis.fetch = async () => { attempts++; throw new Error("Provider accepted but response was lost"); };
        await sendAccountEmails();
        assert.equal((await db.collection("deliveries").findOne({ _id: delivery._id }))!.submissionState, "submitting");
        if (reason === "expired") {
          await db.collection("deliveries").updateOne({ _id: delivery._id }, { $set: { payloadExpiresAt: new Date(0) } });
          await db.collection("authTokens").updateOne({ _id: delivery.authTokenId }, { $set: { expiresAt: new Date(0) } });
        } else {
          await db.collection("authTokens").updateOne({ _id: delivery.authTokenId }, { $set: { consumedAt: new Date() } });
        }
        await db.collection("jobs").updateMany({ state: "retry" }, { $set: { runAt: new Date(0) } });
        await sendAccountEmails();
        const result = await db.collection("deliveries").findOne({ _id: delivery._id });
        assert.equal(result!.submissionState, "unknown");
        assert.equal(result!.payloadEncrypted, undefined);
        assert.equal(attempts, 1);
        assert.equal((await db.collection("jobs").findOne({ "payloadRef.deliveryId": delivery._id }))!.state, "dead");
      }
      globalThis.fetch = originalFetch;
    });
    await t.test("Argon2id runtime benchmark", async () => {
      const start = performance.now();
      await hashPassword(password);
      t.diagnostic(
        `Local Argon2id 64MiB, 3 passes, 1 lane: ${Math.round(performance.now() - start)}ms`,
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (
      db.databaseName !== testDatabase ||
      !/^mmm_auth_test_[a-f0-9]{16}$/.test(testDatabase) ||
      testDatabase === actualDatabase
    )
      throw new Error("Unsafe test cleanup refused");
    await db.dropDatabase();
    await closeDatabase();
  }
});
