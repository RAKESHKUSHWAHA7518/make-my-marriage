import "../scripts/load-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";
import { migrateHouseholds } from "../src/infrastructure/mongodb/migrations/006-households";
import { migrateHouseholdAccess } from "../src/infrastructure/mongodb/migrations/007-household-access";
import { createWedding } from "../src/modules/weddings/service";
import { createEvent } from "../src/modules/events/service";
import { saveHousehold, rsvpTotals } from "../src/modules/households/service";
import { invitationLink, exchangeHousehold, guestSite, saveGuestRsvp, logoutHousehold } from "../src/modules/guest-access/service";
import { handleGuest } from "../src/modules/guest-access/http";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

test("private household access uses only an asserted disposable database", async t => {
  const previous = process.env.MONGODB_DB_NAME, name = `mmm_invitation_test_${randomBytes(8).toString("hex")}`;
  assert.notEqual(name, previous); process.env.MONGODB_DB_NAME = name;
  process.env.APP_ORIGIN = "http://localhost:3001";
  process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.CAPABILITY_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const db = await getDatabase(); assert.equal(db.databaseName, name); assert.match(name, /^mmm_invitation_test_[a-f0-9]{16}$/);
  const key = () => randomBytes(16).toString("hex");
  const token = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;
  async function fixture() {
    const now = new Date(), email = `${key()}@example.test`;
    const user: User = { _id: new ObjectId(), email, emailNormalized: email, displayName: "Isolated organiser", passwordHash: "unused", status: "active", credentialVersion: 1, emailVerifiedAt: now, schemaVersion: 1, createdAt: now, updatedAt: now };
    await db.collection("users").insertOne(user);
    const wedding = await createWedding(user, { title: "Private workspace title", couple: { brideName: "Test", groomName: "Only" }, timezone: "Asia/Kolkata", currency: "INR" }, key());
    const event = await createEvent(user, wedding.id, { name: "Celebration", type: "wedding", startsAt: "2027-02-13T04:30:00Z", venue: { name: "Test venue", address: "Test address" } }, key());
    await db.collection("events").updateOne({ _id: new ObjectId(event.id) }, { $set: { status: "scheduled" } });
    const input = { displayName: "Test family", representative: { name: "Representative", email: "private@example.test", phone: "+919876543210" }, maxGuests: 4, invitedEventIds: [event.id], notes: "PRIVATE NOTES" };
    const group = (await saveHousehold(user, wedding.id, null, input, key()))!;
    return { user, wedding, event, group, input };
  }
  async function opened() { const f = await fixture(), link = await invitationLink(f.user, f.wedding.id, f.group.id); const raw = token(link!.url), session = await exchangeHousehold(raw); return { ...f, link: link!, raw, session }; }
  async function payload(session: string, status = "attending", attendeeCount = 3) { const site = await guestSite(session); return { status, attendeeCount, expectedVersion: site.rsvp.version, expectedInvitationRevision: site.rsvp.invitationRevision }; }
  try {
    await migrateAccounts(db); await migrateWeddings(db); await migrateEvents(db); await migrateHouseholds(db);
    await t.test("missing migration fails closed without creating capability collections", async () => {
      const f = await fixture(); await assert.rejects(invitationLink(f.user, f.wedding.id, f.group.id), { code: "GUEST_ACCESS_UNAVAILABLE" });
      assert.equal(await db.listCollections({ name: "capabilityLinks" }).hasNext(), false);
    });
    await migrateHouseholdAccess(db); await migrateHouseholdAccess(db);
    await t.test("stable encrypted links are shared by authorised roles, never another wedding", async () => {
      const f = await opened();
      const links = await Promise.all([1, 2].map(() => invitationLink(f.user, f.wedding.id, f.group.id))); assert(links.every(l => l!.url === f.link.url));
      const stored = await db.collection("capabilityLinks").findOne({ subjectId: new ObjectId(f.group.id) }); assert.equal(stored!.tokenHash, digest(f.raw)); assert(!JSON.stringify(stored).includes(f.raw));
      await db.collection("memberships").updateOne({ userId: f.user._id }, { $set: { role: "MANAGER" } }); assert.equal((await invitationLink(f.user, f.wedding.id, f.group.id))!.url, f.link.url);
      const other = await fixture(); await assert.rejects(invitationLink(other.user, f.wedding.id, f.group.id), { code: "INVITATION_UNAVAILABLE" });
    });
    await t.test("guest projection exposes only assigned eligible events and safe fields", async () => {
      const f = await opened();
      const draft = await createEvent(f.user, f.wedding.id, { name: "Secret draft", type: "custom", startsAt: "2027-02-14T04:30:00Z", venue: { name: "Private", address: "Private" } }, key());
      await db.collection("households").updateOne({ _id: new ObjectId(f.group.id) }, { $set: { invitedEventIds: [new ObjectId(f.event.id), new ObjectId(draft.id)] } });
      const site = await guestSite(f.session); assert.deepEqual(site.events.map(e => e.id), [f.event.id]);
      assert.doesNotMatch(JSON.stringify(site), /PRIVATE NOTES|private@example|9876543210|Private workspace|currency|tokenHash|encryptedSecret|role|passwordHash|Secret draft/);
    });
    await t.test("responses validate capacity, status, household context and deduplicate concurrent retries", async () => {
      const f = await opened(), input = await payload(f.session), saveKey = key();
      for (const patch of [{ attendeeCount: 5 }, { attendeeCount: 1.5 }, { attendeeCount: 0 }, { status: "maybe", attendeeCount: 1 }, { extra: true }]) await assert.rejects(saveGuestRsvp(f.session, { ...input, ...patch }, key()));
      const b = (await saveHousehold(f.user, f.wedding.id, null, f.input, key()))!, bLink = await invitationLink(f.user, f.wedding.id, b.id), bSession = await exchangeHousehold(token(bLink!.url));
      await assert.rejects(saveGuestRsvp(bSession, input, key()), { code: "VERSION_CONFLICT" });
      const saved = await Promise.all([1, 2, 3].map(() => saveGuestRsvp(f.session, input, saveKey))); assert(saved.every(s => s.rsvp.version === 2));
      assert.equal(await db.collection("activity").countDocuments({ entityId: new ObjectId(f.group.id), action: "household.rsvp_updated" }), 1);
      await assert.rejects(saveGuestRsvp(f.session, { ...input, attendeeCount: 2 }, saveKey), { code: "IDEMPOTENCY_CONFLICT" });
      await assert.rejects(saveGuestRsvp(f.session, input, key()), { code: "VERSION_CONFLICT" });
      assert.equal((await saveGuestRsvp(f.session, await payload(f.session, "maybe", 0), key())).rsvp.attendeeCount, 0);
      assert.equal((await saveGuestRsvp(f.session, await payload(f.session, "not_attending", 0), key())).rsvp.status, "not_attending");
    });
    await t.test("event changes invalidate displayed context, ineligible invitations cannot save", async () => {
      const f = await opened(), input = await payload(f.session);
      await db.collection("events").updateOne({ _id: new ObjectId(f.event.id) }, { $inc: { version: 1 } });
      await assert.rejects(saveGuestRsvp(f.session, input, key()), { code: "VERSION_CONFLICT" });
      await db.collection("events").updateOne({ _id: new ObjectId(f.event.id) }, { $set: { status: "cancelled" } });
      assert.equal((await guestSite(f.session)).events.length, 0); await assert.rejects(saveGuestRsvp(f.session, await payload(f.session), key()), { code: "NO_ELIGIBLE_EVENTS" });
    });
    await t.test("rotation is idempotent and immediately invalidates prior links and sessions", async () => {
      const f = await opened(), rotation = { payload: { expectedLinkVersion: 1 }, key: key() };
      const replaced = await invitationLink(f.user, f.wedding.id, f.group.id, rotation); assert.notEqual(replaced!.url, f.link.url);
      assert.equal((await invitationLink(f.user, f.wedding.id, f.group.id, rotation))!.url, replaced!.url);
      await assert.rejects(exchangeHousehold(f.raw), { code: "INVITATION_UNAVAILABLE" }); await assert.rejects(guestSite(f.session), { code: "INVITATION_UNAVAILABLE" });
      await assert.rejects(saveGuestRsvp(f.session, {}, key()), { code: "INVITATION_UNAVAILABLE" });
      await assert.rejects(invitationLink(f.user, f.wedding.id, f.group.id, { payload: { expectedLinkVersion: 1 }, key: key() }), { code: "LINK_VERSION_CONFLICT" });
      const current = await exchangeHousehold(token(replaced!.url)); await logoutHousehold(current); await assert.rejects(guestSite(current), { code: "INVITATION_UNAVAILABLE" });
    });
    await t.test("late responses are accepted, archived responses are read-only and retry-safe", async () => {
      const f = await opened(); await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { rsvpDeadline: new Date("2020-01-01") } });
      const input = await payload(f.session), saveKey = key(); assert.equal((await saveGuestRsvp(f.session, input, saveKey)).rsvp.updatedAfterDeadline, true);
      await db.collection("weddings").updateOne({ _id: new ObjectId(f.wedding.id) }, { $set: { state: "archived" } });
      assert.equal((await guestSite(f.session)).rsvp.editable, false); assert.equal((await invitationLink(f.user, f.wedding.id, f.group.id))!.url, f.link.url);
      assert.equal((await saveGuestRsvp(f.session, input, saveKey)).rsvp.version, 2);
      await assert.rejects(saveGuestRsvp(f.session, await payload(f.session), key()), { code: "WEDDING_ARCHIVED" });
      await assert.rejects(invitationLink(f.user, f.wedding.id, f.group.id, { payload: { expectedLinkVersion: 1 }, key: key() }), { code: "WEDDING_ARCHIVED" });
    });
    await t.test("dashboard counts each eligible active household once, removed/expired access fails", async () => {
      const f = await opened();
      const extra = await createEvent(f.user, f.wedding.id, { name: "Reception", type: "reception", startsAt: "2027-02-14T04:30:00Z", venue: { name: "Test venue", address: "Test address" } }, key());
      await db.collection("events").updateOne({ _id: new ObjectId(extra.id) }, { $set: { status: "completed" } });
      await db.collection("households").updateOne({ _id: new ObjectId(f.group.id) }, { $set: { invitedEventIds: [new ObjectId(f.event.id), new ObjectId(extra.id)] } });
      assert.equal((await guestSite(f.session)).events.length, 2);
      await saveGuestRsvp(f.session, await payload(f.session), key());
      const totals = await rsvpTotals(f.user, f.wedding.id); assert.equal(totals.attendingPeople, 3); assert.equal(totals.counts.attending, 1);
      await db.collection("households").updateOne({ _id: new ObjectId(f.group.id) }, { $set: { status: "removed" } });
      assert.equal((await rsvpTotals(f.user, f.wedding.id)).attendingPeople, 0); await assert.rejects(guestSite(f.session), { code: "INVITATION_UNAVAILABLE" }); await assert.rejects(exchangeHousehold(f.raw), { code: "INVITATION_UNAVAILABLE" });
      const g = await opened(); await db.collection("capabilitySessions").updateOne({ tokenHash: digest(g.session) }, { $set: { expiresAt: new Date(0) } }); await assert.rejects(guestSite(g.session), { code: "INVITATION_UNAVAILABLE" });
    });
    await t.test("HTTP requires trusted mutations, uses a separate HttpOnly cookie and private responses", async () => {
      const f = await opened(), url = "http://localhost:3001/api/v1/access/exchange";
      const bad = await handleGuest(new NextRequest(url, { method: "POST", body: "{}" }), "exchange"); assert.equal(bad.status, 403);
      const response = await handleGuest(new NextRequest(url, { method: "POST", headers: { Origin: "http://localhost:3001", "X-MMM-CSRF": "1", "Content-Type": "application/json", Cookie: "mmm_session=account-cookie" }, body: JSON.stringify({ kind: "household", token: f.raw }) }), "exchange");
      assert.equal(response.status, 200); assert.match(response.headers.get("set-cookie")!, /mmm_household=.*HttpOnly/i); assert.doesNotMatch(response.headers.get("set-cookie")!, /mmm_session=/);
      assert(!JSON.stringify(await response.json()).includes(f.raw)); assert.match(response.headers.get("cache-control")!, /no-store/); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      const unauthenticated = await handleGuest(new NextRequest("http://localhost:3001/api/v1/guest/site"), "site"); assert.equal(unauthenticated.status, 404);
      const site = await handleGuest(new NextRequest("http://localhost:3001/api/v1/guest/site", { headers: { Cookie: `mmm_household=${f.session}` } }), "site"); assert.equal(site.status, 200);
      const logout = await handleGuest(new NextRequest("http://localhost:3001/api/v1/access/logout", { method: "POST", headers: { Origin: "http://localhost:3001", "X-MMM-CSRF": "1", "Content-Type": "application/json", Cookie: `mmm_household=${f.session}; mmm_session=account-cookie` }, body: JSON.stringify({ kind: "household" }) }), "logout");
      assert.equal(logout.status, 204); assert.equal(await logout.text(), ""); assert.doesNotMatch(logout.headers.get("set-cookie")!, /mmm_session=/);
      await assert.rejects(guestSite(f.session), { code: "INVITATION_UNAVAILABLE" });
    });
  } finally {
    if (db.databaseName === name && /^mmm_invitation_test_[a-f0-9]{16}$/.test(name)) await db.dropDatabase();
    await closeDatabase(); if (previous === undefined) delete process.env.MONGODB_DB_NAME; else process.env.MONGODB_DB_NAME = previous;
  }
});
