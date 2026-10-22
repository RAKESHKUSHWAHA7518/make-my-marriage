import "server-only";
import { getDatabase } from "./client";

let ready: Promise<void> | undefined;
/** Refuse account writes if deployment skipped the explicit unique-index migration. */
export function ensureAccountIndexes() {
  return ready ??= (async () => {
    const db = await getDatabase();
    const required = { users: "emailNormalized", sessions: "tokenHash", authTokens: "tokenHash", jobs: "dedupeKey", deliveries: "dedupeKey" };
    for (const [name, field] of Object.entries(required)) {
      const indexes = await db.collection(name).indexes();
      if (!indexes.some(index => index.unique && Object.keys(index.key).length === 1 && index.key[field] === 1)) throw new Error("Account migration required");
    }
    const limits = await db.collection("rateLimits").indexes();
    if (!limits.some(index => index.unique && Object.keys(index.key).join(",") === "keyHash,action,windowStart")) throw new Error("Account migration required");
  })().catch(error => { ready = undefined; throw error; });
}
