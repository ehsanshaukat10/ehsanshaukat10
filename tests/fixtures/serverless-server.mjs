import http from "node:http";
import { fixtureDatabase } from "./serverless-database.mjs";
import { createApplication } from "../../aynor-onboarding-frontend/source/server/application.mjs";
const fixture = await fixtureDatabase();
const app = createApplication({
  env: {
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
  },
  fetchImpl: fixture.fetchImpl,
});
const server = http.createServer(app);
server.listen(3194, "127.0.0.1", () =>
  console.log("Isolated serverless fixture on 3194"),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await fixture.close();
    process.exit(0);
  }),
);
