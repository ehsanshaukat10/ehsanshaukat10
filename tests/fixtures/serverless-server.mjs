import http from "node:http";
import { fixtureDatabase } from "./serverless-database.mjs";
import { createApplication } from "../../aynor-onboarding-frontend/source/server/application.mjs";
const fixture = await fixtureDatabase();
fixture.control.currentMonthGoogle = true;
const env = {
  NODE_ENV: "development",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
  INITIAL_OWNER_EMAIL: "owner@example.test",
  INITIAL_OWNER_PASSWORD: "a-long-test-password-only",
  // Controlled Google provider used only by the isolated browser tests.
  GOOGLE_CLIENT_ID: "fixture-client",
  GOOGLE_CLIENT_SECRET: "fixture-secret",
  GOOGLE_REDIRECT_URI:
    "https://127.0.0.1:5176/api/integrations/google/callback",
  SHEETS_ENCRYPTION_KEY: "ab".repeat(32),
};
const app = createApplication({ env, fetchImpl: fixture.fetchImpl });
const server = http.createServer(async (req, res) => {
  // Local fixture only. The deployed application has no confirmation bypass.
  if (req.url === "/api/__fixture/confirm-email" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const account = fixture.control.authUsers.get(JSON.parse(raw).email);
    if (account) account.email_confirmed_at = new Date().toISOString();
    res.writeHead(account ? 200 : 404, { "Content-Type": "application/json" });
    const token = "fixture-confirmation-" + account?.id;
    if (account) fixture.control.authTokens.set(token, account.email);
    res.end(JSON.stringify({ ok: !!account, accessToken: token }));
    return;
  }
  if (req.url === "/api/__fixture/recovery-token" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const account = fixture.control.authUsers.get(JSON.parse(raw).email);
    const token = "fixture-recovery-" + crypto.randomUUID();
    if (account) fixture.control.recoveryTokens.set(token, account.email);
    res.writeHead(account ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ accessToken: token }));
    return;
  }
  if (req.url === "/api/__fixture/ai" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    env.AYNOR_AI_ENABLED = "true";
    env.OPENROUTER_API_KEY = "fixture-only-key";
    env.AYNOR_AI_MODEL = "fixture/classifier:free";
    fixture.control.aiMode = body.mode || "valid";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        calls: fixture.control.aiCalls,
        metadata: fixture.control.aiMetadata,
      }),
    );
    return;
  }
  await app(req, res);
});
server.listen(3194, "127.0.0.1", () =>
  console.log("Isolated serverless fixture on 3194"),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await fixture.close();
    process.exit(0);
  }),
);
