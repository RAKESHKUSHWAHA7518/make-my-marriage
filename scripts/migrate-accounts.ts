import "./load-env";
import {
  getDatabase,
  closeDatabase,
} from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";

async function main() {
  try {
    await migrateAccounts(await getDatabase());
    console.log("Account migration 001 applied: validators and indexes ready.");
  } catch {
    console.error(
      "Account migration failed. Check database access and existing schema/index compatibility. Details redacted.",
    );
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => {});
  }
}
void main();
