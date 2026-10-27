import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { bootstrapOwner } from "../server/bootstrap.js";
test("initial owner is opt-in, validated, stored through the password hasher and never resets existing identities", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,password TEXT,verified INTEGER DEFAULT 0)",
  );
  const hashPassword = (value) =>
    createHash("sha256").update(value).digest("hex");
  const boot = (env) => bootstrapOwner({ db, hashPassword, env });
  try {
    assert.equal(boot({}), undefined);
    assert.throws(
      () => boot({ INITIAL_OWNER_EMAIL: "owner@example.test" }),
      /both/,
    );
    assert.throws(
      () =>
        boot({
          INITIAL_OWNER_EMAIL: "bad",
          INITIAL_OWNER_PASSWORD: "a".repeat(20),
        }),
      /valid email/,
    );
    assert.throws(
      () =>
        boot({
          INITIAL_OWNER_EMAIL: "owner@example.test",
          INITIAL_OWNER_PASSWORD: "short",
        }),
      /16/,
    );
    const env = {
      INITIAL_OWNER_EMAIL: " Owner@Example.test ",
      INITIAL_OWNER_PASSWORD: "test-long-owner-password",
    };
    const id = boot(env),
      original = db.prepare("SELECT * FROM users").get();
    assert.equal(original.verified, 1);
    assert.equal(original.email, "owner@example.test");
    assert.notEqual(original.password, env.INITIAL_OWNER_PASSWORD);
    assert.equal(
      boot({ ...env, INITIAL_OWNER_PASSWORD: "changed-long-secret" }),
      id,
    );
    assert.deepEqual(db.prepare("SELECT * FROM users").get(), original);
    db.prepare("UPDATE users SET verified=0").run();
    assert.throws(() => boot(env), /unverified/);
    assert.equal(db.prepare("SELECT verified FROM users").get().verified, 0);
  } finally {
    db.close();
  }
});
