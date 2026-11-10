import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { POST as resendWebhook } from "../src/app/api/webhooks/resend/route";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateHouseholds } from "../src/infrastructure/mongodb/migrations/006-households";
import { migrateHouseholdAccess } from "../src/infrastructure/mongodb/migrations/007-household-access";
import { migrateGuestInvitationEmail } from "../src/infrastructure/mongodb/migrations/021-guest-invitation-email";
import { createWedding } from "../src/modules/weddings/service";
import { saveHousehold } from "../src/modules/households/service";
import { invitationLink } from "../src/modules/guest-access/service";
import type { User } from "../src/modules/identity/service";
import { sendAccountEmails } from "../src/infrastructure/resend/account-mail";
import { cancelInvitationEmail, invitationEmailDetails, queueInvitationEmail, reviewInvitationEmail } from "../src/modules/invitation-email/service";

test("guest email queue and Resend handoff on an isolated replica", async t => {
  assert.equal(process.env.MONGODB_URI, "mongodb://127.0.0.1:27197/?replicaSet=designsqa");
  const key = () => randomBytes(16).toString("hex");
  Object.assign(process.env, {
    MONGODB_DB_NAME: `mmm_email_test_${key()}`,
    APP_ORIGIN: "http://localhost:3011",
    RATE_LIMIT_HMAC_KEY: key() + key(),
    CAPABILITY_ENCRYPTION_KEY: key() + key(),
    ACCOUNT_EMAIL_ENCRYPTION_KEY: key() + key(),
    GUEST_INVITATION_EMAIL_ENABLED: "true",
    CRON_SECRET: key() + key(),
    RESEND_API_KEY: "isolated-test",
    RESEND_FROM_EMAIL: "Wedding <sender@example.test>",
    RESEND_WEBHOOK_SECRET: `whsec_${randomBytes(32).toString("base64")}`,
  });
  const db = await getDatabase();
  assert.match(db.databaseName, /^mmm_email_test_[a-f0-9]{32}$/);
  assert.equal((await db.admin().command({ hello: 1 })).setName, "designsqa");
  const originalFetch = globalThis.fetch;
  const requests: { body: string; key: string | null }[] = [];
  let fail = false;
  let beforeAccept: (() => Promise<void>) | undefined;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.resend.com/emails");
    requests.push({ body: String(init?.body), key: new Headers(init?.headers).get("Idempotency-Key") });
    await beforeAccept?.();
    if (fail) throw Error("Simulated response loss");
    return Response.json({ id: `fake-message-${requests.length}` });
  };

  async function fixture() {
    const now = new Date();
    const email = `${key()}@example.test`;
    const user: User = {
      _id: new ObjectId(), email, emailNormalized: email, displayName: "QA only", passwordHash: "unused",
      status: "active", credentialVersion: 1, emailVerifiedAt: now, createdAt: now, updatedAt: now, schemaVersion: 1,
    };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Isolated email QA", couple: { brideName: "Test <Family>", groomName: "Only" }, currency: "INR", timezone: "Asia/Kolkata" }, key());
    const eventId = new ObjectId();
    const event = { weddingId: new ObjectId(wedding.id), type: "wedding", startsAt: now, venue: { name: "Venue", address: "Address" }, schedule: [], status: "scheduled", version: 1, createdBy: user._id, createdAt: now, updatedAt: now, schemaVersion: 1 };
    await db.collection("events").insertMany([{ ...event, _id: eventId, name: "Invited <Ceremony>" }, { ...event, name: "Private event" }]);
    const household = await saveHousehold(user, wedding.id, null, {
      displayName: "QA household", representative: { name: "QA", email: `guest-${key()}@example.test` }, maxGuests: 4, invitedEventIds: [String(eventId)],
    }, key());
    const link = await invitationLink(user, wedding.id, household.id);
    async function payload() {
      const preview = await reviewInvitationEmail(user, wedding.id, household.id);
      assert.deepEqual(preview.issues, []);
      assert(!JSON.stringify(preview).includes("#token="));
      return { kind: "invitation", householdIds: [household.id], eventIds: preview.eventIds, expectedReviewHash: preview.reviewHash };
    }
    return { user, wedding, eventId, household, link, payload };
  }

  try {
    for (const migration of [migrateAccounts, migrateWeddings, migrateEvents, migrateHouseholds, migrateHouseholdAccess, migrateGuestInvitationEmail]) await migration(db);
    await t.test("concurrent same-key queue and confirmed delivery preserve the exact household snapshot", async () => {
      const f = await fixture();
      const payload = await f.payload();
      const submission = key();
      const [a, b] = await Promise.all([1, 2].map(() => queueInvitationEmail(f.user, f.wedding.id, payload, submission)));
      assert.equal(a!.campaignId, b!.campaignId);
      await assert.rejects(queueInvitationEmail(f.user, f.wedding.id, payload, key()), { code: "EMAIL_ALREADY_REQUESTED" });
      assert.equal((await invitationEmailDetails(f.user, f.wedding.id, a!.campaignId)).status, "queued");
      await migrateAccounts(db);
      await migrateGuestInvitationEmail(db);
      await sendAccountEmails();
      assert.equal(requests.length, 1);
      const message = JSON.parse(requests[0].body);
      assert.equal(message.to.length, 1);
      assert(message.text.includes(f.link!.url));
      assert(!message.text.includes("Private event"));
      assert(message.html.includes("Invited &lt;Ceremony&gt;"));
      assert.equal((await invitationEmailDetails(f.user, f.wedding.id, a!.campaignId)).status, "accepted");
      const now = new Date();
      const webhookId = key();
      const webhookBody = JSON.stringify({ type: "email.delivered", created_at: now.toISOString(), data: { email_id: "fake-message-1" } });
      const signature = new Webhook(process.env.RESEND_WEBHOOK_SECRET!).sign(webhookId, now, webhookBody);
      const callback = (signed: string) => new NextRequest("http://localhost:3011/api/webhooks/resend", {
        method: "POST", body: webhookBody, headers: {
          "svix-id": webhookId, "svix-timestamp": String(Math.floor(now.getTime() / 1000)), "svix-signature": signed,
        },
      });
      assert.equal((await resendWebhook(callback("invalid"))).status, 400);
      assert.equal((await resendWebhook(callback(signature))).status, 204);
      assert.equal((await resendWebhook(callback(signature))).status, 204);
      assert.equal((await invitationEmailDetails(f.user, f.wedding.id, a!.campaignId)).status, "delivered");
      const outsider = await fixture();
      await assert.rejects(invitationEmailDetails(outsider.user, outsider.wedding.id, a!.campaignId), { status: 404 });
    });
    await t.test("scope drift blocks queueing and suppresses an already queued email", async () => {
      const f = await fixture();
      const old = await f.payload();
      await db.collection("events").updateOne({ _id: f.eventId }, { $inc: { version: 1 } });
      await assert.rejects(queueInvitationEmail(f.user, f.wedding.id, old, key()), { code: "REVIEW_CHANGED" });
      const queued = await queueInvitationEmail(f.user, f.wedding.id, await f.payload(), key());
      await db.collection("events").updateOne({ _id: f.eventId }, { $set: { status: "cancelled" } });
      await sendAccountEmails();
      assert.equal(requests.length, 1);
      assert.equal((await invitationEmailDetails(f.user, f.wedding.id, queued!.campaignId)).status, "suppressed");
    });
    await t.test("cancellation stops pending dispatch and cannot race a provider handoff", async () => {
      const f = await fixture();
      const queued = await queueInvitationEmail(f.user, f.wedding.id, await f.payload(), key());
      await cancelInvitationEmail(f.user, f.wedding.id, queued!.campaignId, { expectedVersion: 1 });
      await cancelInvitationEmail(f.user, f.wedding.id, queued!.campaignId, { expectedVersion: 1 });
      await sendAccountEmails();
      assert.equal(requests.length, 1);
      assert.equal((await invitationEmailDetails(f.user, f.wedding.id, queued!.campaignId)).status, "cancelled");
      const g = await fixture();
      const next = await queueInvitationEmail(g.user, g.wedding.id, await g.payload(), key());
      beforeAccept = async () => {
        await assert.rejects(cancelInvitationEmail(g.user, g.wedding.id, next!.campaignId, { expectedVersion: 1 }), { code: "EMAIL_CANNOT_CANCEL" });
      };
      await sendAccountEmails();
      beforeAccept = undefined;
      assert.equal((await invitationEmailDetails(g.user, g.wedding.id, next!.campaignId)).status, "accepted");
    });
    await t.test("uncertain provider retries keep the exact payload and dedupe key", async () => {
      const f = await fixture();
      const queued = await queueInvitationEmail(f.user, f.wedding.id, await f.payload(), key());
      fail = true;
      await sendAccountEmails();
      assert.equal((await invitationEmailDetails(f.user, f.wedding.id, queued!.campaignId)).status, "unknown");
      fail = false;
      await db.collection("jobs").updateMany({ kind: "guest_invitation_send", state: "retry" }, { $set: { runAt: new Date() } });
      await sendAccountEmails();
      assert.deepEqual(requests.at(-1), requests.at(-2));
      assert.equal((await invitationEmailDetails(f.user, f.wedding.id, queued!.campaignId)).status, "accepted");
    });
  } finally {
    globalThis.fetch = originalFetch;
    await db.dropDatabase();
    await closeDatabase();
  }
});
