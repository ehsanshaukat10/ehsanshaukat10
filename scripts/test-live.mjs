import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "aynor-e2e-")),
  children = [];
const start = (args, env = {}) => {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
};
try {
  const api = start(["tests/fixtures/google-server.mjs"], {
    PORT: "3195",
    ENABLE_DEV_SESSION: "true",
    DATA_DIR: directory,
    NODE_ENV: "development",
  });
  const vite = start(
    [
      "node_modules/vite/bin/vite.js",
      "aynor-onboarding-frontend/source",
      "--config",
      "aynor-onboarding-frontend/source/vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      "5176",
      "--strictPort",
    ],
    { VITE_API_MODE: "server", AYNOR_API_URL: "http://127.0.0.1:3195" },
  );
  for (let i = 0; i < 100; i++) {
    if (api.exitCode !== null || vite.exitCode !== null)
      throw Error("Test services could not start; check occupied ports.");
    try {
      if (
        (await fetch("http://127.0.0.1:3195/api/config")).ok &&
        (await fetch("http://127.0.0.1:5176")).ok
      )
        break;
    } catch {}
    if (i === 99) throw Error("Test startup timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
  const check = start(["tests/live.browser.mjs"]);
  const code = await new Promise((resolve) => check.on("exit", resolve));
  if (code !== 0) throw Error("Live browser journey failed");
} finally {
  await Promise.all(
    children
      .filter((child) => child.exitCode === null)
      .map(
        (child) =>
          new Promise((resolve) => {
            child.once("exit", resolve);
            child.kill();
          }),
      ),
  );
  rmSync(directory, { recursive: true, force: true });
}
