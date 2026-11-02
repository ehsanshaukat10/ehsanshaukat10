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
  const tableCheck = start(["tests/tables.browser.mjs"]);
  if ((await new Promise((r) => tableCheck.on("exit", r))) !== 0)
    throw Error("Flexible tables browser check failed.");
  const accountCheck = start(["tests/accounts.browser.mjs"]);
  if ((await new Promise((r) => accountCheck.on("exit", r))) !== 0)
    throw Error("Account browser check failed.");
  const journeyCheck = start(["tests/customer-journey.browser.mjs"]);
  if ((await new Promise((r) => journeyCheck.on("exit", r))) !== 0)
    throw Error("Full customer journey browser check failed.");
  const automaticCheck = start(["tests/automatic.browser.mjs"]);
  if ((await new Promise((r) => automaticCheck.on("exit", r))) !== 0)
    throw Error("Automatic mapping browser check failed.");
  const feedbackCheck = start(["tests/import-feedback.browser.mjs"]);
  if ((await new Promise((r) => feedbackCheck.on("exit", r))) !== 0)
    throw Error("Import feedback regression browser check failed.");
  const loadingCheck = start(["tests/overview-loading.browser.mjs"]);
  if ((await new Promise((r) => loadingCheck.on("exit", r))) !== 0)
    throw Error("Overview loading browser check failed.");
  const populatedCheck = start(["tests/populated-overview.browser.mjs"]);
  if ((await new Promise((r) => populatedCheck.on("exit", r))) !== 0)
    throw Error("Populated overview browser check failed.");
  const executiveCheck = start(["tests/executive-dashboard.browser.mjs"]);
  if (
    (await new Promise((resolve) => executiveCheck.on("exit", resolve))) !== 0
  )
    throw Error("Executive reporting browser check failed.");
  const stabilization = start(["tests/ux-stabilization.browser.mjs"]);
  if ((await new Promise((resolve) => stabilization.on("exit", resolve))) !== 0)
    throw Error("UX stabilization browser check failed.");
  // Independent authorization group gets a fresh isolated database; keep real login quotas.
  await new Promise((resolve) => {
    api.once("exit", resolve);
    api.kill();
  });
  const permissionApi = start(["tests/fixtures/serverless-server.mjs"]);
  for (let attempt = 0; attempt < 150; attempt++) {
    if (permissionApi.exitCode !== null)
      throw Error("Permission fixture failed to start");
    try {
      if ((await fetch("http://127.0.0.1:3194/api/health")).ok) break;
    } catch {}
    if (attempt === 149) throw Error("Permission fixture startup timeout");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const permissions = start(["tests/intelligence-permissions.browser.mjs"]);
  if ((await new Promise((resolve) => permissions.on("exit", resolve))) !== 0)
    throw Error("Intelligence permissions browser check failed.");
  const modules = start(["tests/departments-actions.browser.mjs"]);
  if ((await new Promise((resolve) => modules.on("exit", resolve))) !== 0)
    throw Error("Departments and Actions browser check failed.");
  const dependencies = start(["tests/relationships.browser.mjs"]);
  if ((await new Promise((resolve) => dependencies.on("exit", resolve))) !== 0)
    throw Error("Dependencies browser check failed.");
  const goals = start(["tests/goals.browser.mjs"]);
  if ((await new Promise((resolve) => goals.on("exit", resolve))) !== 0)
    throw Error("Goals browser check failed.");
  const ask = start(["tests/ask.browser.mjs"]);
  if ((await new Promise((resolve) => ask.on("exit", resolve))) !== 0)
    throw Error("Ask browser check failed.");
  const sessionConnections = start(["tests/session-connections.browser.mjs"]);
  if ((await new Promise((r) => sessionConnections.on("exit", r))) !== 0)
    throw Error("Session and connection acceptance failed.");
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
