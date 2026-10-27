import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("production mode serves the SPA and never exposes development delivery", async () => {
  assert.ok(
    existsSync("aynor-onboarding-frontend/source/dist/index.html"),
    "Run npm run build before the full API suite.",
  );
  const dir = mkdtempSync(join(tmpdir(), "aynor-production-"));
  const child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      FRONTEND_DIST: "aynor-onboarding-frontend/source/dist",
      ENABLE_DEV_SESSION: "true",
      PORT: "3197",
      DATA_DIR: dir,
    },
    stdio: "pipe",
  });
  const base = "http://127.0.0.1:3197";
  try {
    let response;
    for (let i = 0; i < 50; i++) {
      try {
        response = await fetch(base + "/api/config");
        if (response.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(response?.ok);
    const config = await response.json();
    assert.equal(config.development, false);
    assert.equal(config.developmentSession, false);
    assert.equal(
      (
        await fetch(base + "/api/dev/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    const page = await fetch(base + "/welcome");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /id="root"/);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    const signup = await fetch(base + "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        email: "test@example.com",
        password: "long-password-123",
      }),
    });
    assert.equal(signup.status, 503);
    assert.equal((await signup.json()).developmentToken, undefined);
    const malformed = await fetch(base + "/%ZZ");
    assert.equal(malformed.status, 400);
    assert.equal((await fetch(base + "/api/config")).status, 200);
  } finally {
    child.kill();
    await new Promise((r) => child.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
});
