import "./load-env.ts";
import {
  getDatabase,
  closeDatabase,
} from "../src/infrastructure/mongodb/client.ts";

try {
  const database = await getDatabase();
  await database.command({ ping: 1 });
  const topology = await database.admin().command({ hello: 1 });
  const transactions = Boolean(
    topology.logicalSessionTimeoutMinutes &&
      (topology.setName || topology.msg === "isdbgrid"),
  );
  console.log("MongoDB authenticated connection and ping: PASS");
  console.log(`Transaction-capable topology: ${transactions ? "YES" : "NO"}`);
  console.log("Read-only check: no collections or records created.");
  if (!transactions) process.exitCode = 1;
} catch {
  console.error(
    "Database check failed. Check MongoDB configuration, credentials, DNS and Atlas network access. Connection details are redacted.",
  );
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}
