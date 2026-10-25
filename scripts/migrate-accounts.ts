import "./load-env";
import {
  getDatabase,
  closeDatabase,
} from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateMembershipInvites } from "../src/infrastructure/mongodb/migrations/003-membership-invites";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";

async function main() {
  try {
    await migrateAccounts(await getDatabase());
    await migrateWeddings(await getDatabase());
    await migrateMembershipInvites(await getDatabase());
    await migrateEvents(await getDatabase());
    console.log(
      "Migrations 001–004 applied: account, wedding, invitations and event validators/indexes ready.",
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
