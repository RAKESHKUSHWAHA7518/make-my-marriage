import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BSON, Long, ObjectId } from "mongodb";
import { getDatabase, closeDatabase } from "../src/infrastructure/mongodb/client";
import { createWedding } from "../src/modules/weddings/service";
import { createUpload, completeUpload, assetFor } from "../src/modules/media/service";
import { saveDesign, designFor } from "../src/modules/designs/service";
import { migrateGallery } from "../src/infrastructure/mongodb/migrations/008-gallery";
import { migrateWebsitePublication } from "../src/infrastructure/mongodb/migrations/016-website-publication";
import { publicationReview, publishDesign } from "../src/modules/designs/publication";
import { saveTask } from "../src/modules/tasks/service";
import { saveExpense, expenseSummary } from "../src/modules/expenses/service";
import { listPrivateAttachments, removePrivateAttachment } from "../src/modules/media/attachments";
import { handleMedia } from "../src/modules/media/http";
import { handlePrivateAttachments } from "../src/modules/media/attachments-http";
import { NextRequest } from "next/server";
import { digest } from "../src/modules/identity/security";
import type { User } from "../src/modules/identity/service";

test("full CLI migration runner preserves invitation, public and task media through two populated reruns", async t => {
  const uri="mongodb://127.0.0.1:27197/?replicaSet=designsqa"; assert.equal(process.env.MONGODB_URI,uri);
  const name=`mmm_migration_test_${randomBytes(8).toString("hex")}`, directory=await mkdtemp(join(tmpdir(),"mmm-migration-cli-"));
  process.env.CAPABILITY_ENCRYPTION_KEY=randomBytes(32).toString("hex");process.env.RATE_LIMIT_HMAC_KEY=randomBytes(32).toString("hex");process.env.MONGODB_DB_NAME=name; process.env.APP_ORIGIN="http://localhost:3011"; process.env.CLOUDINARY_CLOUD_NAME="test-only";process.env.CLOUDINARY_API_KEY="123";process.env.CLOUDINARY_API_SECRET="synthetic-only";
  const db=await getDatabase(); assert.equal(db.databaseName,name);assert.equal((await db.admin().command({hello:1})).setName,"designsqa");
  const run=async()=>{const result=await promisify(execFile)(process.execPath,["--conditions=react-server","--import",pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,resolve("scripts/migrate-accounts.ts")],{cwd:directory,env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,NODE_ENV:"test",MONGODB_URI:uri,MONGODB_DB_NAME:name},timeout:60000,maxBuffer:100000});assert.match(result.stdout,/Migrations 001–024 applied/);};
  const priorFetch=globalThis.fetch, provider=new Map<string,Record<string,unknown>>(),key=()=>randomBytes(16).toString("hex");
  globalThis.fetch=async url=>{
    const request=String(url);
    if (request.startsWith("https://res.cloudinary.com/")) {
      assert.match(request, /\/image\/authenticated\/s--[^/]+--\/v1\/mmm\/[a-f0-9]{24}\/(?:task-attachments|receipts)\/[a-f0-9]{32}\.pdf$/);
      return new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } });
    }
    assert.match(request,/^https:\/\/api\.cloudinary\.com\//);
    const target=decodeURIComponent(new URL(request).pathname.split("/authenticated/")[1]??"");
    return provider.has(target)?Response.json(provider.get(target)):Response.json({}, {status:404});
  };
  async function records(){const hash=createHash("sha256"),collections=await db.listCollections({}, {nameOnly:true}).toArray();for(const c of collections.sort((a,b)=>a.name.localeCompare(b.name))){hash.update(c.name);for await(const row of db.collection(c.name).find().sort({_id:1}))hash.update(BSON.serialize(row));}return hash.digest("hex");}
  async function metadata(){const rows=await db.listCollections({}, {nameOnly:false}).toArray();return Promise.all(rows.sort((a,b)=>a.name.localeCompare(b.name)).map(async c=>({name:c.name,options:{...c.options,validationLevel:c.options?.validationLevel??"strict",validationAction:c.options?.validationAction??"error"},indexes:await db.collection(c.name).indexes()})));}
  try{
    await run();
    const now=new Date(),email=`${key()}@example.test`,user:User={_id:new ObjectId(),email,emailNormalized:email,displayName:"Migration QA",passwordHash:"unused",status:"active",credentialVersion:1,emailVerifiedAt:now,createdAt:now,updatedAt:now,schemaVersion:1};await db.collection("users").insertOne(user);
    const wedding=await createWedding(user,{title:"Isolated migration QA",couple:{brideName:"Test",groomName:"Only"},currency:"INR",timezone:"Asia/Kolkata"},key());
    async function upload(purpose:"invitation"|"gallery"){const intent=await createUpload(user,{purpose,...(purpose==="invitation"?{eventIds:[]}:{}),filename:"card.png",contentType:"image/png",sizeBytes:"100"},key());provider.set(intent!.upload.fields.public_id,{asset_id:key(),public_id:intent!.upload.fields.public_id,type:"authenticated",resource_type:"image",format:"png",bytes:80,width:100,height:150,version:1});return intent!;}
    const first=await upload("invitation"),saved=await completeUpload(user,first.id);assert(saved&&"assetId"in saved);
    const draft=await saveDesign(user,wedding.id,null,{name:"Retain image",mode:"uploaded_image",eventIds:[],draft:{assetIds:[saved.assetId!]}},key());
    const review=await publicationReview(user,wedding.id,draft.id);
    const published=await publishDesign(user,wedding.id,draft.id,{expectedVersion:review.expectedVersion,expectedPublishedVersionId:review.expectedPublishedVersionId,expectedReviewHash:review.expectedReviewHash},key());
    assert(published?.designVersionId);
    const gallery=await upload("gallery"),gallerySaved=await completeUpload(user,gallery.id);assert(gallerySaved&&"assetId"in gallerySaved);
    const task = await saveTask(user, wedding.id, null, { title: "Review layout", checklist: [{ id: "one", text: "Check layout", done: false }] }, key());
    const otherTask = await saveTask(user, wedding.id, null, { title: "Other task" }, key());
    const input = { purpose: "task_attachment", taskId: task.id, filename: "layout plan.pdf", contentType: "application/pdf", sizeBytes: "100" };
    await assert.rejects(createUpload(user, { ...input, filename: "bad.png" }, key()), { code: "INVALID_FILE" });
    await assert.rejects(createUpload(user, { ...input, sizeBytes: "4000001" }, key()), { code: "INVALID_FILE" });
    await assert.rejects(createUpload({ _id: new ObjectId(), kind: "gallery", token: "unused", weddingId: new ObjectId(wedding.id) }, input, key()), { code: "FORBIDDEN" });
    const uploadKey = key(), taskIntent = await createUpload(user, input, uploadKey);
    assert.equal((await createUpload(user, input, uploadKey)).id, taskIntent.id);
    assert.equal(taskIntent.upload.fields.allowed_formats, "pdf");
    const publicId = taskIntent.upload.fields.public_id;
    provider.set(publicId, { asset_id: key(), public_id: publicId, type: "authenticated", resource_type: "image", format: "pdf", bytes: 80, pages: 2, version: 1 });
    const completed = await Promise.all([completeUpload(user, taskIntent.id), completeUpload(user, taskIntent.id)]);
    assert.ok(completed[0]?.assetId);
    const assetId = completed[0].assetId;
    assert.equal(completed[1]?.assetId, assetId);
    const expenseInput = { title: "Venue deposit", amountMinor: "120000", currency: "INR", expenseDate: "2026-11-10T06:00:00Z", category: "venue" };
    const expense = await saveExpense(user, wedding.id, null, expenseInput, key());
    const otherExpense = await saveExpense(user, wedding.id, null, { ...expenseInput, title: "Other deposit" }, key());
    const totals = await expenseSummary(user, wedding.id);
    const receiptInput = { ...input, purpose: "receipt", taskId: undefined, expenseId: expense.id };
    await assert.rejects(createUpload(user, { ...receiptInput, taskId: task.id }, key()), { code: "INVALID_SCOPE" });
    const receiptIntent = await createUpload(user, receiptInput, key());
    const receiptTarget = receiptIntent.upload.fields.public_id;
    assert.match(receiptTarget, /\/receipts\//);
    provider.set(receiptTarget, { asset_id: key(), public_id: receiptTarget, type: "authenticated", resource_type: "image", format: "pdf", bytes: 80, pages: 2, version: 1 });
    const receiptAsset = await completeUpload(user, receiptIntent.id);
    assert.ok(receiptAsset?.assetId);
    const receiptId = receiptAsset.assetId;
    assert.deepEqual(await expenseSummary(user, wedding.id), totals);
    await db.collection("assets").insertOne({weddingId:new ObjectId(wedding.id),purpose:"public_copy",visibility:"public_page",state:"preparing",publicId:`mmm/${wedding.id}/website/${key()}`,sourceAssetId:new ObjectId(gallerySaved.assetId!),operationKey:key(),reservedBytes:Long.ZERO,expiresAt:new Date(Date.now()+3600000),nextCheckAt:new Date(Date.now()+3600000),version:1,schemaVersion:1,createdAt:now,updatedAt:now});
    const pending=await upload("invitation"),before=await metadata(),fingerprint=await records();
    for(let pass=1;pass<=2;pass++)await t.test(`full db:migrate rerun ${pass} preserves validators, indexes and all records`,async()=>{await run();assert.deepEqual(await metadata(),before);assert.equal(await records(),fingerprint);assert.equal((await assetFor(user,saved.assetId!)).purpose,"invitation");assert((await designFor(user,wedding.id,draft.id))!.imageAvailable);});
    await t.test("direct 008/016 calls preserve newer validators and partial indexes",async()=>{await migrateGallery(db);assert.deepEqual(await metadata(),before);await migrateWebsitePublication(db);assert.deepEqual(await metadata(),before);assert.equal(await records(),fingerprint);});
    await t.test("an invitation upload reserved before reruns still finalizes and new uploads work",async()=>{const finalized=await completeUpload(user,pending.id);assert(finalized&&"assetId"in finalized);assert.equal((await assetFor(user,finalized.assetId!)).purpose,"invitation");const next=await upload("invitation");assert((await completeUpload(user,next.id))!.ready);assert.equal(await db.collection("designVersions").countDocuments(),1);});
    await t.test("task PDF remains private, downloadable and removable after migration reruns", async () => {
      const { files } = await listPrivateAttachments(user, "task_attachment", wedding.id, task.id);
      assert.deepEqual(files, [{ id: assetId, filename: input.filename, format: "pdf", bytes: "80", version: 1 }]);
      assert.deepEqual((await listPrivateAttachments(user, "task_attachment", wedding.id, otherTask.id)).files, []);
      await assert.rejects(removePrivateAttachment(user, "task_attachment", wedding.id, otherTask.id, assetId, { expectedVersion: 1 }), { status: 404 });
      const stored = await db.collection("tasks").findOne({ _id: new ObjectId(task.id) });
      assert.deepEqual(stored?.checklist, task.checklist);
      assert.equal(stored?.status, task.status);
      const token = randomBytes(32).toString("base64url"), url = `http://localhost:3011/api/v1/media/${assetId}/content`;
      await db.collection("sessions").insertOne({ userId: user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const headers = { Cookie: `mmm_session=${token}` };
      assert.equal((await handleMedia(new NextRequest(url + "?variant=download"), "content", assetId)).status, 401);
      assert.equal((await handleMedia(new NextRequest(url, { headers }), "content", assetId)).status, 404);
      const download = await handleMedia(new NextRequest(url + "?variant=download", { headers }), "content", assetId);
      assert.equal(download.status, 200);
      assert.match(download.headers.get("content-disposition")!, /^attachment;/);
      assert.match(download.headers.get("cache-control")!, /no-store/);
      assert.equal(await download.text(), "%PDF-1.4");
      await db.collection("weddings").updateOne({ _id: new ObjectId(wedding.id) }, { $set: { state: "archived" } });
      assert.equal((await listPrivateAttachments(user, "task_attachment", wedding.id, task.id)).readOnly, true);
      await assert.rejects(removePrivateAttachment(user, "task_attachment", wedding.id, task.id, assetId, { expectedVersion: 1 }), { code: "WEDDING_ARCHIVED" });
      await db.collection("weddings").updateOne({ _id: new ObjectId(wedding.id) }, { $set: { state: "active" } });
      assert.equal((await removePrivateAttachment(user, "task_attachment", wedding.id, task.id, assetId, { expectedVersion: 1 }))?.removed, true);
      assert.equal((await removePrivateAttachment(user, "task_attachment", wedding.id, task.id, assetId, { expectedVersion: 1 }))?.removed, true);
      assert.deepEqual((await listPrivateAttachments(user, "task_attachment", wedding.id, task.id)).files, []);
      await assert.rejects(assetFor(user, assetId), { status: 404 });
    });
    await t.test("expense receipts remain private, preserve totals and respect the saved expense lifecycle", async () => {
      const list = () => listPrivateAttachments(user, "receipt", wedding.id, expense.id);
      const token = randomBytes(32).toString("base64url");
      await db.collection("sessions").insertOne({ userId: user._id, tokenHash: digest(token), credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), lastSeenAt: now, schemaVersion: 1, createdAt: now, updatedAt: now });
      const url = `http://localhost:3011/api/v1/weddings/${wedding.id}/expenses/${expense.id}/receipts`;
      const headers = { Cookie: `mmm_session=${token}` };
      const read = await handlePrivateAttachments(new NextRequest(url, { headers }), "receipt", wedding.id, expense.id);
      assert.equal(read.status, 200);
      assert.match(read.headers.get("cache-control")!, /no-store/);
      assert.deepEqual((await read.json()).data.files.map((file: { id: string }) => file.id), [receiptId]);
      assert.equal((await handlePrivateAttachments(new NextRequest(url), "receipt", wedding.id, expense.id)).status, 401);
      const download = await handleMedia(new NextRequest(`http://localhost:3011/api/v1/media/${receiptId}/content?variant=download`, { headers }), "content", receiptId);
      assert.equal(download.status, 200);
      assert.match(download.headers.get("content-disposition")!, /^attachment;/);
      assert.equal(await download.text(), "%PDF-1.4");
      const remove = (origin = "http://localhost:3011") => handlePrivateAttachments(new NextRequest(`${url}/${receiptId}/remove`, {
        method: "POST", headers: { ...headers, Origin: origin, "X-MMM-CSRF": "1", "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1 }),
      }), "receipt", wedding.id, expense.id, receiptId);
      assert.equal((await remove("https://other.example")).status, 403);
      assert.deepEqual((await list()).files.map(file => file.id), [receiptId]);
      assert.deepEqual((await listPrivateAttachments(user, "receipt", wedding.id, otherExpense.id)).files, []);
      await assert.rejects(removePrivateAttachment(user, "receipt", wedding.id, otherExpense.id, receiptId, { expectedVersion: 1 }), { status: 404 });
      const updated = await saveExpense(user, wedding.id, expense.id, { expectedVersion: expense.version + 1, notes: "Reviewed", receiptAssetIds: [] }, key());
      assert.equal(updated.amountMinor, expense.amountMinor);
      assert.deepEqual((await list()).files.map(file => file.id), [receiptId]);
      await db.collection("weddings").updateOne({ _id: new ObjectId(wedding.id) }, { $set: { state: "archived" } });
      assert.equal((await list()).readOnly, true);
      const archived = await remove();
      assert.equal(archived.status, 409);
      assert.equal((await archived.json()).error.code, "WEDDING_ARCHIVED");
      assert.equal((await assetFor(user, receiptId)).purpose, "receipt");
      await db.collection("weddings").updateOne({ _id: new ObjectId(wedding.id) }, { $set: { state: "active" } });
      for (let pass = 0; pass < 2; pass++) {
        const response = await remove();
        assert.equal(response.status, 200);
        assert.equal((await response.json()).data.removed, true);
      }
      assert.deepEqual(await expenseSummary(user, wedding.id), totals);
      await assert.rejects(assetFor(user, receiptId), { status: 404 });

      const second = await createUpload(user, { ...receiptInput, expenseId: otherExpense.id }, key());
      const secondTarget = second.upload.fields.public_id;
      provider.set(secondTarget, { asset_id: key(), public_id: secondTarget, type: "authenticated", resource_type: "image", format: "pdf", bytes: 80, version: 1 });
      const saved = await completeUpload(user, second.id);
      assert.ok(saved?.assetId);
      const pendingReceipt = await createUpload(user, { ...receiptInput, expenseId: otherExpense.id }, key());
      const pendingTarget = pendingReceipt.upload.fields.public_id;
      provider.set(pendingTarget, { asset_id: key(), public_id: pendingTarget, type: "authenticated", resource_type: "image", format: "pdf", bytes: 80, version: 1 });
      await saveExpense(user, wedding.id, otherExpense.id, { expectedVersion: otherExpense.version + 1 }, key(), true);
      await assert.rejects(assetFor(user, saved.assetId), { status: 404 });
      await assert.rejects(completeUpload(user, second.id), { status: 404 });
      await assert.rejects(completeUpload(user, pendingReceipt.id), { status: 404 });
      await assert.rejects(createUpload(user, { ...receiptInput, expenseId: otherExpense.id }, key()), { status: 404 });
    });
  }finally{globalThis.fetch=priorFetch;await db.dropDatabase();await closeDatabase();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.match(basename(directory),/^mmm-migration-cli-/);await rm(directory,{recursive:true,force:true});}
});
