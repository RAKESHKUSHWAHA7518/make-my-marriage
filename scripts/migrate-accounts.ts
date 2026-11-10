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
import { migrateVendors } from "../src/infrastructure/mongodb/migrations/012-vendors";
import { migrateGoogleVendors } from "../src/infrastructure/mongodb/migrations/013-google-vendors";
import { migrateExpenseVendors } from "../src/infrastructure/mongodb/migrations/014-expense-vendors";
import { migrateWebsiteDrafts } from "../src/infrastructure/mongodb/migrations/015-website-drafts";
import { migrateWebsitePublication } from "../src/infrastructure/mongodb/migrations/016-website-publication";
import { migrateAnnouncements } from "../src/infrastructure/mongodb/migrations/017-announcements";
import { migrateTaskChecklists } from "../src/infrastructure/mongodb/migrations/018-task-checklists";

import { migrateInvitationDrafts } from "../src/infrastructure/mongodb/migrations/019-invitation-drafts";

import { migrateInvitationPublication } from "../src/infrastructure/mongodb/migrations/020-invitation-publication";

import { migrateGuestInvitationEmail } from "../src/infrastructure/mongodb/migrations/021-guest-invitation-email";
import { migrateTaskComments } from "../src/infrastructure/mongodb/migrations/022-task-comments";

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
    await migrateVendors(await getDatabase());
    await migrateGoogleVendors(await getDatabase());
    await migrateExpenseVendors(await getDatabase());
    await migrateWebsiteDrafts(await getDatabase());
    await migrateWebsitePublication(await getDatabase());
    await migrateAnnouncements(await getDatabase());
    await migrateTaskChecklists(await getDatabase());
    await migrateInvitationDrafts(await getDatabase());
    await migrateInvitationPublication(await getDatabase());
    await migrateGuestInvitationEmail(await getDatabase());
    await migrateTaskComments(await getDatabase());
    console.log(
      "Migrations 001–022 applied. Application validators and indexes are ready.",
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
