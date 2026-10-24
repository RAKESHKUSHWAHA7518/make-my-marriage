import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

test("maintenance environment isolation and precedence", () => {
  const directory = mkdtempSync(join(tmpdir(), "mmm-env-test-"));
  const loader = pathToFileURL(resolve("scripts/load-env.ts")).href;
  const tsx = pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href;
  try {
    for (const [file, content] of Object.entries({
      ".env": "MMM_TEST_BASE=base\nMMM_TEST_VALUE=base",
      ".env.local": "MMM_TEST_LOCAL=local\nMMM_TEST_VALUE=local",
      ".env.development": "MMM_TEST_MODE=development",
      ".env.production": "MMM_TEST_MODE=production",
      ".env.test": "MMM_TEST_MODE=test",
      ".env.development.local": "MMM_TEST_VALUE=development-local",
      ".env.production.local": "MMM_TEST_VALUE=production-local",
    })) writeFileSync(join(directory, file), content);
    const run = (mode?: "development" | "production" | "test", shellValue?: string) => {
      const env = { ...process.env };
      for (const name of Object.keys(env)) if (name.startsWith("MMM_TEST_") || name === "NODE_ENV") delete env[name];
      if (mode) env.NODE_ENV = mode;
      if (shellValue) env.MMM_TEST_VALUE = shellValue;
      return JSON.parse(execFileSync(process.execPath, [
        "--import", tsx, "--input-type=module", "-e",
        `await import(${JSON.stringify(loader)}); console.log(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('MMM_TEST_')))));`,
      ], { cwd: directory, env, encoding: "utf8" }));
    };
    assert.equal(run().MMM_TEST_VALUE, "development-local");
    const production = run("production");
    assert.equal(production.MMM_TEST_VALUE, "production-local");
    assert.equal(production.MMM_TEST_MODE, "production");
    assert.equal(production.MMM_TEST_BASE, "base");
    const testing = run("test");
    assert.equal(testing.MMM_TEST_VALUE, "base");
    assert.equal(testing.MMM_TEST_LOCAL, undefined);
    assert.equal(testing.MMM_TEST_MODE, "test");
    assert.equal(run("production", "shell").MMM_TEST_VALUE, "shell");
  } finally {
    // Only remove the exact directory created by this test.
    assert.ok(directory.startsWith(join(tmpdir(), "mmm-env-test-")));
    rmSync(directory, { recursive: true, force: true });
  }
});
