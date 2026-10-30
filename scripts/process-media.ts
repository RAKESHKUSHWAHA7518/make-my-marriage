import "./load-env";
import { reconcileMedia } from "../src/modules/media/service";
import { closeDatabase } from "../src/infrastructure/mongodb/client";

async function main() {
  try {
    const result = await reconcileMedia();
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } catch {
    console.error("Media cleanup unavailable. Verify configuration, migration and provider access. Details redacted.");
    process.exitCode = 1;
  } finally { await closeDatabase().catch(() => {}); }
}
void main();
