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
import type { User } from "../src/modules/identity/service";

test("full CLI migration runner preserves invitation/public media through two populated reruns", async t => {
  const uri="mongodb://127.0.0.1:27197/?replicaSet=designsqa"; assert.equal(process.env.MONGODB_URI,uri);
  const name=`mmm_migration_test_${randomBytes(8).toString("hex")}`, directory=await mkdtemp(join(tmpdir(),"mmm-migration-cli-"));
  process.env.CAPABILITY_ENCRYPTION_KEY=randomBytes(32).toString("hex");process.env.RATE_LIMIT_HMAC_KEY=randomBytes(32).toString("hex");process.env.MONGODB_DB_NAME=name; process.env.APP_ORIGIN="http://localhost:3011"; process.env.CLOUDINARY_CLOUD_NAME="test-only";process.env.CLOUDINARY_API_KEY="123";process.env.CLOUDINARY_API_SECRET="synthetic-only";
  const db=await getDatabase(); assert.equal(db.databaseName,name);assert.equal((await db.admin().command({hello:1})).setName,"designsqa");
  const run=async()=>{const result=await promisify(execFile)(process.execPath,["--conditions=react-server","--import",pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,resolve("scripts/migrate-accounts.ts")],{cwd:directory,env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,NODE_ENV:"test",MONGODB_URI:uri,MONGODB_DB_NAME:name},timeout:60000,maxBuffer:100000});assert.match(result.stdout,/Migrations 001–020 applied/);};
  const priorFetch=globalThis.fetch, provider=new Map<string,Record<string,unknown>>(),key=()=>randomBytes(16).toString("hex");
  globalThis.fetch=async url=>{const request=String(url);assert.match(request,/^https:\/\/api\.cloudinary\.com\//);const target=decodeURIComponent(new URL(request).pathname.split("/authenticated/")[1]??"");return provider.has(target)?Response.json(provider.get(target)):Response.json({}, {status:404});};
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
    await db.collection("assets").insertOne({weddingId:new ObjectId(wedding.id),purpose:"public_copy",visibility:"public_page",state:"preparing",publicId:`mmm/${wedding.id}/website/${key()}`,sourceAssetId:new ObjectId(gallerySaved.assetId!),operationKey:key(),reservedBytes:Long.ZERO,expiresAt:new Date(Date.now()+3600000),nextCheckAt:new Date(Date.now()+3600000),version:1,schemaVersion:1,createdAt:now,updatedAt:now});
    const pending=await upload("invitation"),before=await metadata(),fingerprint=await records();
    for(let pass=1;pass<=2;pass++)await t.test(`full db:migrate rerun ${pass} preserves validators, indexes and all records`,async()=>{await run();assert.deepEqual(await metadata(),before);assert.equal(await records(),fingerprint);assert.equal((await assetFor(user,saved.assetId!)).purpose,"invitation");assert((await designFor(user,wedding.id,draft.id))!.imageAvailable);});
    await t.test("direct 008/016 calls preserve newer validators and partial indexes",async()=>{await migrateGallery(db);assert.deepEqual(await metadata(),before);await migrateWebsitePublication(db);assert.deepEqual(await metadata(),before);assert.equal(await records(),fingerprint);});
    await t.test("an invitation upload reserved before reruns still finalizes and new uploads work",async()=>{const finalized=await completeUpload(user,pending.id);assert(finalized&&"assetId"in finalized);assert.equal((await assetFor(user,finalized.assetId!)).purpose,"invitation");const next=await upload("invitation");assert((await completeUpload(user,next.id))!.ready);assert.equal(await db.collection("designVersions").countDocuments(),1);});
  }finally{globalThis.fetch=priorFetch;await db.dropDatabase();await closeDatabase();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.match(basename(directory),/^mmm-migration-cli-/);await rm(directory,{recursive:true,force:true});}
});
