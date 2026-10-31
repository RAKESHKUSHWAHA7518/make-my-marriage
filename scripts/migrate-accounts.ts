import "./load-env";
import {
  getDatabase,
  closeDatabase,
} from "../src/infrastructure/mongodb/client";
import { migrateAccounts } from "../src/infrastructure/mongodb/migrations/001-accounts";
import { migrateWeddings } from "../src/infrastructure/mongodb/migrations/002-weddings";
import { migrateMembershipInvites } from "../src/infrastructure/mongodb/migrations/003-membership-invites";
import { migrateEvents } from "../src/infrastructure/mongodb/migrations/004-events";

import { migrateTasks } from "../src/infrastructure/mongodb/migrations/005-tasks";
import { migrateHouseholds } from "../src/infrastructure/mongodb/migrations/006-households";

import { migrateHouseholdAccess } from "../src/infrastructure/mongodb/migrations/007-household-access";

import { migrateGallery } from "../src/infrastructure/mongodb/migrations/008-gallery";
import { migrateGalleryAccess } from "../src/infrastructure/mongodb/migrations/009-gallery-access";
import { migrateGuestUploads } from "../src/infrastructure/mongodb/migrations/010-guest-uploads";
import { migrateExpenses } from "../src/infrastructure/mongodb/migrations/011-expenses";

async function main() {
  try {
    await migrateAccounts(await getDatabase());
    await migrateWeddings(await getDatabase());
    await migrateMembershipInvites(await getDatabase());
    await migrateEvents(await getDatabase());
    await migrateTasks(await getDatabase());
    await migrateHouseholds(await getDatabase());
    await migrateHouseholdAccess(await getDatabase());
    await migrateGallery(await getDatabase());
    await migrateGalleryAccess(await getDatabase());
    await migrateGuestUploads(await getDatabase());
    await migrateExpenses(await getDatabase());
    console.log(
      "Migrations 001–011 applied: account, wedding, invitations, events, tasks, households, gallery and expense validators/indexes ready.",
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
