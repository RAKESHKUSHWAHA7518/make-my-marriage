import type { Db, Document } from "mongodb";

/** Add the receipt purpose to the already-activated family media validators. */
export async function migrateExpenseReceipts(db: Db) {
  const [assets, intents] = await Promise.all(["assets", "uploadIntents"].map(async name =>
    structuredClone((await db.listCollections({ name }, { nameOnly: false }).next())?.options?.validator)));
  const task = assets?.$or?.find((branch: Document) => branch.$jsonSchema?.properties?.purpose?.enum?.includes("task_attachment"));
  const schema = intents?.$jsonSchema;
  const condition = schema?.allOf?.[0];
  const taskIntent = condition?.oneOf?.find((branch: Document) => branch.properties?.purpose?.enum?.includes("task_attachment"));
  if (!task || !taskIntent || schema.allOf.length !== 1) throw Error("Apply migration 023 before enabling expense receipts.");
  const purpose = "receipt", expenseId = { bsonType: "objectId" };
  const receipt = structuredClone(task.$jsonSchema);
  delete receipt.properties.taskId;
  receipt.properties.expenseId = expenseId;
  receipt.properties.purpose = { enum: [purpose] };
  receipt.required = receipt.required.map((key: string) => key === "taskId" ? "expenseId" : key);
  assets.$or = [...assets.$or.filter((branch: Document) => !branch.$jsonSchema?.properties?.purpose?.enum?.includes(purpose)), { $jsonSchema: receipt }];
  schema.properties.purpose.enum = [...new Set([...schema.properties.purpose.enum, purpose])];
  schema.properties.expenseId = expenseId;
  const rule = structuredClone(taskIntent);
  rule.required = ["expenseId", "attachmentFormat"];
  rule.properties.purpose = { enum: [purpose] };
  condition.oneOf = [...condition.oneOf.filter((branch: Document) => !branch.properties?.purpose?.enum?.includes(purpose)), rule];
  for (const [name, validator] of [["assets", assets], ["uploadIntents", intents]] as const) {
    if (await db.collection(name).findOne({ $nor: [validator] }, { projection: { _id: 1 } })) throw Error("Existing media require review before receipt activation.");
  }
  for (const [name, validator] of [["assets", assets], ["uploadIntents", intents]] as const) {
    await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
  }
}
