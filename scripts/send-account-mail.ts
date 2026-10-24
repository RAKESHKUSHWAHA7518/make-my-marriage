import "./load-env";
import { sendAccountEmails } from "../src/infrastructure/resend/account-mail";
import { closeDatabase } from "../src/infrastructure/mongodb/client";

async function main() {
  try {
    console.log(await sendAccountEmails());
  } catch {
    console.error(
      "Email processing unavailable. Check Resend and account email configuration. Details redacted.",
    );
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => {});
  }
}
void main();
