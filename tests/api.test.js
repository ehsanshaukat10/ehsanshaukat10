import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "aynor-test-"));
const base = "http://127.0.0.1:3198/api";
let child;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
before(async () => {
  child = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: "3198", DATA_DIR: dir },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/config")).ok) return;
    } catch {}
    await wait(100);
  }
  throw Error("Server did not start");
});
after(() => {
  child?.kill();
  rmSync(dir, { recursive: true, force: true });
});
async function call(path, method = "GET", body, cookie = "", headers = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function account(email) {
  const r = await call("/auth/signup", "POST", {
    name: email.split("@")[0],
    email,
    password: "Strong-password-123",
  });
  assert.equal(r.status, 201);
  const verify = await call(
    "/auth/verify",
    "POST",
    { token: r.data.developmentToken },
    r.cookie,
  );
  assert.equal(verify.status, 200);
  return { cookie: r.cookie, id: r.data.user.id, email };
}
const profile = {
  name: "Acme Technologies",
  industry: "Technology & software",
  country: "Pakistan",
  currency: "PKR",
  timezone: "Asia/Karachi",
};
test("account, company, authorization, invitation, and persistence workflows", async (t) => {
  const owner = await account("owner@acme.test");
  const outsider = await account("other@acme.test");
  let c;
  await t.test(
    "HTTP-only session and idempotent company creation",
    async () => {
      const auth = await call("/auth/login", "POST", {
        email: owner.email,
        password: "Strong-password-123",
      });
      assert.equal(auth.status, 200);
      assert.match(auth.cookie, /aynor_session=/);
      const r = await call("/companies", "POST", profile, owner.cookie, {
        "Idempotency-Key": "create-a",
      });
      assert.equal(r.status, 201);
      c = r.data;
      assert.equal(c.role, "Owner");
      const repeated = await call("/companies", "POST", profile, owner.cookie, {
        "Idempotency-Key": "create-a",
      });
      assert.equal(repeated.data.id, c.id);
      assert.equal(
        (await call("/companies", "GET", null, owner.cookie)).data.length,
        1,
      );
    },
  );
  await t.test(
    "unauthenticated and cross-company reads are denied",
    async () => {
      assert.equal((await call(`/companies/${c.id}`)).status, 401);
      assert.equal(
        (await call(`/companies/${c.id}`, "GET", null, outsider.cookie)).status,
        403,
      );
      assert.equal(
        (
          await call(
            `/companies/${c.id}`,
            "PATCH",
            { version: 1, data: c.data },
            outsider.cookie,
          )
        ).status,
        403,
      );
    },
  );
  await t.test("independent companies may have the same name", async () => {
    const second = await call("/companies", "POST", profile, owner.cookie);
    assert.equal(second.status, 201);
    assert.notEqual(second.data.id, c.id);
    assert.equal(second.data.data.departments.length, 0);
  });
  await t.test(
    "configuration persists and rejects concurrent edits",
    async () => {
      const data = {
        ...c.data,
        departments: ["Finance", "Operations"],
        priorities: ["Cash flow"],
        steps: { departments: "completed" },
        step: "priorities",
      };
      const updated = await call(
        `/companies/${c.id}`,
        "PATCH",
        { version: c.version, data },
        owner.cookie,
      );
      assert.equal(updated.status, 200);
      assert.equal(
        (
          await call(
            `/companies/${c.id}`,
            "PATCH",
            { version: c.version, data },
            owner.cookie,
          )
        ).status,
        409,
      );
      c = updated.data;
      const restored = await call(
        `/companies/${c.id}`,
        "GET",
        null,
        owner.cookie,
      );
      assert.deepEqual(restored.data.data.departments, [
        "Finance",
        "Operations",
      ]);
      assert.equal(restored.data.data.step, "priorities");
    },
  );
  let invite, viewer;
  await t.test(
    "secure invitations bind verified identity and reject duplicates",
    async () => {
      viewer = await account("viewer@acme.test");
      const r = await call(
        `/companies/${c.id}/invitations`,
        "POST",
        { email: viewer.email, role: "Viewer", scope: ["Operations"] },
        owner.cookie,
      );
      assert.equal(r.status, 200);
      invite = r.data.developmentLink.split("/").pop();
      assert.equal(
        (await call(`/invitations/${invite}`, "GET", null, outsider.cookie))
          .status,
        403,
      );
      assert.equal(
        (
          await call(
            `/companies/${c.id}/invitations`,
            "POST",
            { email: viewer.email, role: "Viewer", scope: ["Operations"] },
            owner.cookie,
          )
        ).status,
        409,
      );
      assert.equal(
        (await call(`/invitations/${invite}/accept`, "POST", {}, viewer.cookie))
          .status,
        200,
      );
      assert.equal(
        (await call(`/invitations/${invite}/accept`, "POST", {}, viewer.cookie))
          .status,
        409,
      );
    },
  );
  await t.test(
    "viewer cannot escalate privileges or read company configuration",
    async () => {
      const r = await call(`/companies/${c.id}`, "GET", null, viewer.cookie);
      assert.equal(r.status, 200);
      assert.equal(r.data.role, "Viewer");
      assert.equal(r.data.data.sources, undefined);
      assert.equal(r.data.data.goals, undefined);
      assert.deepEqual(r.data.data.departments, ["Operations"]);
      assert.equal(
        (
          await call(
            `/companies/${c.id}`,
            "PATCH",
            { version: c.version, data: c.data },
            viewer.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await call(`/companies/${c.id}/members`, "GET", null, viewer.cookie))
          .status,
        403,
      );
      assert.equal(
        (
          await call(
            `/companies/${c.id}/invitations`,
            "POST",
            { email: "someone@acme.test", role: "Owner" },
            viewer.cookie,
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "ownership cannot be granted or removed by ordinary operations",
    async () => {
      assert.equal(
        (
          await call(
            `/companies/${c.id}/invitations`,
            "POST",
            { email: "new@acme.test", role: "Owner" },
            owner.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await call(
            `/companies/${c.id}/members/${owner.id}`,
            "DELETE",
            {},
            owner.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await call(`/companies/${c.id}/leave`, "POST", {}, owner.cookie))
          .status,
        403,
      );
    },
  );
  await t.test("membership changes take effect immediately", async () => {
    assert.equal(
      (
        await call(
          `/companies/${c.id}/members/${viewer.id}`,
          "DELETE",
          {},
          owner.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(`/companies/${c.id}`, "GET", null, viewer.cookie)).status,
      403,
    );
  });
  await t.test("revoked invitations cannot be accepted", async () => {
    const r = await call(
      `/companies/${c.id}/invitations`,
      "POST",
      { email: outsider.email, role: "Executive" },
      owner.cookie,
    );
    await call(
      `/companies/${c.id}/invitations/${r.data.id}`,
      "DELETE",
      {},
      owner.cookie,
    );
    assert.equal(
      (
        await call(
          `/invitations/${r.data.developmentLink.split("/").pop()}/accept`,
          "POST",
          {},
          outsider.cookie,
        )
      ).status,
      409,
    );
  });
  await t.test(
    "password recovery rotates credentials and revokes sessions",
    async () => {
      const reset = await call("/auth/recover", "POST", {
        email: outsider.email,
      });
      assert.equal(reset.status, 200);
      assert.equal(
        (
          await call("/auth/reset", "POST", {
            token: reset.data.developmentToken,
            password: "Replacement-password-123",
          })
        ).status,
        200,
      );
      assert.equal(
        (await call("/session", "GET", null, outsider.cookie)).data.user,
        null,
      );
      assert.equal(
        (
          await call("/auth/reset", "POST", {
            token: reset.data.developmentToken,
            password: "Replacement-password-123",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await call("/auth/login", "POST", {
            email: outsider.email,
            password: "Strong-password-123",
          })
        ).status,
        401,
      );
    },
  );
  await t.test("archive hides workspace from every member", async () => {
    assert.equal(
      (await call(`/companies/${c.id}/archive`, "POST", {}, owner.cookie))
        .status,
      200,
    );
    assert.equal(
      (await call(`/companies/${c.id}`, "GET", null, owner.cookie)).status,
      404,
    );
  });
});
