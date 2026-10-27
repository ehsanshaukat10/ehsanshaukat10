import { request } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("development access is explicit, same-origin, localhost-only and tenant scoped; sessions survive restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aynor-live-api-"));
  let child;
  const base = "http://127.0.0.1:3196";
  async function start(enabled) {
    child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        PORT: "3196",
        DATA_DIR: dir,
        ENABLE_DEV_SESSION: enabled ? "true" : "false",
      },
      stdio: "pipe",
    });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(base + "/api/config")).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("Server did not start");
  }
  async function stop() {
    child.kill();
    await new Promise((r) => child.once("exit", r));
  }
  const post = (path, body = {}, cookie = "", headers = {}) =>
    fetch(base + "/api" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    });
  try {
    await start(false);
    assert.equal((await post("/dev/session")).status, 403);
    await stop();
    await start(true);
    assert.equal(
      (await post("/dev/session", {}, "", { Origin: "https://evil.example" }))
        .status,
      403,
    );
    const hostStatus = await new Promise((resolve, reject) => {
      const req = request(
        base + "/api/dev/session",
        {
          method: "POST",
          headers: { Host: "evil.example", "Content-Type": "application/json" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end("{}");
    });
    assert.equal(hostStatus, 403);
    const session = await post("/dev/session");
    assert.equal(session.status, 201);
    const cookie = session.headers.get("set-cookie").split(";")[0];
    assert.match(session.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(
      (await (await post("/dev/session", {}, cookie)).json()).user.id,
      (
        await (
          await fetch(base + "/api/session", { headers: { Cookie: cookie } })
        ).json()
      ).user.id,
    );
    const company = await (
      await post(
        "/companies",
        {
          name: "Persisted live",
          industry: "Technology",
          country: "Pakistan",
          currency: "PKR",
          timezone: "Asia/Karachi",
        },
        cookie,
      )
    ).json();
    assert.ok(company.id);
    assert.equal(
      (await fetch(base + "/api/companies/" + company.id + "/sheets")).status,
      401,
    );
    const other = await post("/dev/session");
    const otherCookie = other.headers.get("set-cookie").split(";")[0];
    for (const suffix of ["", "/overview", "/events"])
      assert.equal(
        (
          await fetch(
            base + "/api/companies/" + company.id + "/sheets" + suffix,
            { headers: { Cookie: otherCookie } },
          )
        ).status,
        403,
      );
    const status = await (
      await fetch(base + "/api/companies/" + company.id + "/sheets", {
        headers: { Cookie: cookie },
      })
    ).json();
    assert.equal(status.connected, false);
    await stop();
    await start(true);
    assert.equal(
      (
        await (
          await fetch(base + "/api/companies/" + company.id, {
            headers: { Cookie: cookie },
          })
        ).json()
      ).name,
      "Persisted live",
    );
  } finally {
    if (child && !child.killed) await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
