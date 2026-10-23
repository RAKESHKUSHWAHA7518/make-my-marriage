import "./load-env";
import {
  getDatabase,
  closeDatabase,
} from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";

async function main() {
  try {
    await migrateAccounts(await getDatabase());
    await migrateWeddings(await getDatabase());
    console.log(
      "Migrations 001 and 002 applied: account and wedding validators/indexes ready.",
    );
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
