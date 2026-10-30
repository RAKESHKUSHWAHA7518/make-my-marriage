import "./load-env";
import { checkMediaConnection } from "../src/infrastructure/cloudinary/provider";

checkMediaConnection().then(() => console.log("Cloudinary read-only connection verified. No media uploaded or deleted.")).catch(() => {
  console.error("Cloudinary connection check failed. Verify server configuration and network access. Details redacted.");
  process.exitCode = 1;
});
