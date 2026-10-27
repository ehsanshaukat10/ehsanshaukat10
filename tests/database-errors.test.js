import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../aynor-onboarding-frontend/source/server/database.mjs";
test("Supabase failures expose only safe operation/code diagnostics, never provider record contents or credentials", async () => {
  const original = console.error,
    logs = [];
  console.error = (...args) => logs.push(args);
  const sensitive = "private-record-value-and-password-hash";
  try {
    for (const [status, code, expected] of [
      [403, "42501", /denied database permissions/],
      [400, "PGRST204", /required database column/],
      [401, "PGRST301", /rejected the server credential/],
      [400, "23502", /POST aynor_users; 23502/],
      [500, "untrusted\n" + sensitive, /HTTP_500/],
    ]) {
      const db = createDatabase({
        env: {
          SUPABASE_URL: "https://test.supabase.co",
          SUPABASE_SECRET_KEY: "sb_secret_fixture",
        },
        fetchImpl: async () =>
          Response.json(
            { code, message: sensitive, details: sensitive, hint: sensitive },
            { status },
          ),
      });
      await assert.rejects(
        () => db.insert("users", { password: sensitive }),
        (error) => {
          assert.match(error.message, expected);
          assert.ok(!error.message.includes(sensitive));
          assert.ok(!error.message.includes("sb_secret_fixture"));
          return true;
        },
      );
    }
    assert.ok(!JSON.stringify(logs).includes(sensitive));
    assert.ok(!JSON.stringify(logs).includes("sb_secret_fixture"));
  } finally {
    console.error = original;
  }
});
