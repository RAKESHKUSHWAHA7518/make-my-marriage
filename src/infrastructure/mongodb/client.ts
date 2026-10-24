import "server-only";
import { MongoClient } from "mongodb";
import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/\S+$/),
  MONGODB_DB_NAME: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

const connection = globalThis as typeof globalThis & {
  weddingMongo?: Promise<MongoClient>;
};

function configuration() {
  const result = schema.safeParse({
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
  });
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(
      `Invalid database configuration: ${[...new Set(fields)].join(", ")}`,
    );
  }
  return result.data;
}

/** Lazily reuse a bounded pool per Node process; never connect during page builds. */
export async function getDatabase() {
  const config = configuration();
  if (!connection.weddingMongo) {
    let client: MongoClient;
    try { client = new MongoClient(config.MONGODB_URI, {
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 15_000,
    }); } catch { throw new Error("Invalid MONGODB_URI configuration"); }
    connection.weddingMongo = client.connect().catch(async () => {
      connection.weddingMongo = undefined;
      await client.close().catch(() => {});
      // Driver messages can contain connection details. Keep failures redacted.
      throw new Error(
        "Database connection failed. Check credentials and network access.",
      );
    });
  }
  const client = await connection.weddingMongo;
  return client.db(config.MONGODB_DB_NAME);
}

/** Used by short-lived maintenance commands, not after each web request. */
export async function closeDatabase() {
  const pending = connection.weddingMongo;
  connection.weddingMongo = undefined;
  if (pending) await (await pending).close();
}
