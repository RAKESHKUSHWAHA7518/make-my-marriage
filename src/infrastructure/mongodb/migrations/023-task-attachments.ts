import type { Db } from "mongodb";

/** Extend the existing validators without rewriting media records. */
export async function migrateTaskAttachments(db: Db) {
  const assets = structuredClone((await db.listCollections({ name: "assets" }, { nameOnly: false }).next())?.options?.validator);
  const intents = structuredClone((await db.listCollections({ name: "uploadIntents" }, { nameOnly: false }).next())?.options?.validator);
  const branches = assets?.$or;
  const invitation = branches?.find((branch: { $jsonSchema?: { properties?: { purpose?: { enum?: string[] } } } }) => branch.$jsonSchema?.properties?.purpose?.enum?.includes("invitation"));
  const schema = intents?.$jsonSchema, intentBranches = schema?.allOf?.[0]?.oneOf;
  if (!invitation || !intentBranches || schema.allOf.length !== 1) throw Error("Invitation media migrations must be applied first.");
  const purpose = "task_attachment", taskId = { bsonType: "objectId" }, format = { enum: ["jpg", "png", "webp", "pdf"] };
  const attachment = structuredClone(invitation.$jsonSchema);
  attachment.properties = { ...attachment.properties, purpose: { enum: [purpose] }, taskId, format };
  for (const key of ["audienceEventIds", "orphanAfter"]) delete attachment.properties[key];
  attachment.required = [...attachment.required.filter((key: string) => !["audienceEventIds", "orphanAfter", "width", "height"].includes(key)), "taskId"];
  attachment.oneOf = [
    { properties: { format: { enum: ["pdf"] } } },
    { properties: { format: { enum: ["jpg", "png", "webp"] } }, required: ["width", "height"] },
  ];
  assets.$or = [...branches.filter((branch: typeof invitation) => !branch.$jsonSchema?.properties?.purpose?.enum?.includes(purpose)), { $jsonSchema: attachment }];
  schema.properties.purpose.enum = [...new Set([...schema.properties.purpose.enum, purpose])];
  schema.properties.taskId = taskId;
  schema.properties.attachmentFormat = format;
  schema.allOf[0].oneOf = [
    ...intentBranches.filter((branch: { properties: { purpose: { enum: string[] } } }) => !branch.properties.purpose.enum.includes(purpose)),
    { required: ["taskId", "attachmentFormat"], properties: { purpose: { enum: [purpose] }, actor: { required: ["userId", "credentialVersion"], properties: { type: { enum: ["user"] } } } } },
  ];
  for (const [name, validator] of [["assets", assets], ["uploadIntents", intents]] as const) {
    if (await db.collection(name).findOne({ $nor: [validator] }, { projection: { _id: 1 } })) throw Error("Existing media require review before task attachment activation.");
  }
  for (const [name, validator] of [["assets", assets], ["uploadIntents", intents]] as const) {
    await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
  }
}
