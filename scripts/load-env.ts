import { existsSync } from "node:fs";

const environment = process.env.NODE_ENV ?? "development";
if (!["development", "production", "test"].includes(environment)) {
  throw new Error("NODE_ENV must be development, production or test");
}

// Match Next.js precedence; shell-provided values remain authoritative.
for (const file of [
  `.env.${environment}.local`,
  ...(environment === "test" ? [] : [".env.local"]),
  `.env.${environment}`,
  ".env",
]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
