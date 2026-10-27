import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { spawn } from "node:child_process";
if (process.env.NODE_ENV === "production")
  throw Error("Development sessions cannot run in production.");
const children = [];
function start(args, env = {}) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("exit", (code) => {
    for (const peer of children) if (peer !== child) peer.kill();
    process.exitCode = code || 0;
  });
  return child;
}
start(["server/index.js"], { ENABLE_DEV_SESSION: "true" });
start(
  [
    "node_modules/vite/bin/vite.js",
    "aynor-onboarding-frontend/source",
    "--config",
    "aynor-onboarding-frontend/source/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
  ],
  { VITE_API_MODE: "server" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
console.log(
  "Live development: http://127.0.0.1:5173 — localhost-only session, no login screen.",
);
