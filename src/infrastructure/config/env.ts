import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_ORIGIN: z.url().refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username && !url.password &&
        url.pathname === "/" && !url.search && !url.hash
      );
    } catch {
      return false;
    }
  }, "Must be an HTTP(S) origin without credentials, a path, query, or fragment"),
});

/** Read only when needed; provider configuration is added with its feature. */
export function getServerEnv() {
  const result = schema.safeParse({
    APP_ORIGIN: process.env.APP_ORIGIN ?? "http://localhost:3000",
  });

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    // Report variable names only: invalid configuration may contain secrets.
    throw new Error(`Invalid server configuration: ${fields.join(", ")}`);
  }

  return result.data;
}
