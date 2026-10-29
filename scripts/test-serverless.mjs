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
  const build = start(
    [
      "node_modules/vite/bin/vite.js",
      "build",
      "aynor-onboarding-frontend/source",
      "--config",
      "aynor-onboarding-frontend/source/vite.config.ts",
    ],
    { VERCEL: "1", VITE_API_MODE: "" },
  );
  if ((await new Promise((resolve) => build.on("exit", resolve))) !== 0)
    throw Error("Vercel-mode build failed.");
  const api = start(["tests/fixtures/serverless-server.mjs"]);
  const vite = start(
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "aynor-onboarding-frontend/source",
      "--config",
      "aynor-onboarding-frontend/source/vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      "5176",
      "--strictPort",
    ],
    { VERCEL: "1", VITE_API_MODE: "", AYNOR_API_URL: "http://127.0.0.1:3194" },
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
  const privateCheck = start(["tests/private-sheets.browser.mjs"]);
  if ((await new Promise((r) => privateCheck.on("exit", r))) !== 0)
    throw Error("Private Sheets browser check failed.");
  const uploadCheck = start(["tests/upload-sheets.browser.mjs"]);
  if ((await new Promise((r) => uploadCheck.on("exit", r))) !== 0)
    throw Error("Upload Sheets browser check failed.");
  const accountCheck = start(["tests/accounts.browser.mjs"]);
  if ((await new Promise((r) => accountCheck.on("exit", r))) !== 0)
    throw Error("Account browser check failed.");
  const journeyCheck = start(["tests/customer-journey.browser.mjs"]);
  if ((await new Promise((r) => journeyCheck.on("exit", r))) !== 0)
    throw Error("Full customer journey browser check failed.");
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
