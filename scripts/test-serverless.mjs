import { spawn } from "node:child_process";
const children = [];
function start(args, env = {}) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
}
try {
  const api = start(["tests/fixtures/serverless-server.mjs"]);
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
    { VITE_API_MODE: "server", AYNOR_API_URL: "http://127.0.0.1:3194" },
  );
  for (let i = 0; i < 150; i++) {
    if (api.exitCode !== null || vite.exitCode !== null)
      throw Error("Test services failed to start.");
    try {
      if (
        (await fetch("http://127.0.0.1:3194/api/health")).ok &&
        (await fetch("http://127.0.0.1:5176")).ok
      )
        break;
    } catch {}
    if (i === 149) throw Error("Test startup timeout.");
    await new Promise((r) => setTimeout(r, 100));
  }
  const check = start(["tests/live.browser.mjs"], { SERVERLESS_TEST: "true" });
  const code = await new Promise((r) => check.on("exit", r));
  if (code !== 0) throw Error("Serverless browser check failed.");
} finally {
  await Promise.all(
    children
      .filter((c) => c.exitCode === null)
      .map(
        (c) =>
          new Promise((r) => {
            c.once("exit", r);
            c.kill();
          }),
      ),
  );
}
