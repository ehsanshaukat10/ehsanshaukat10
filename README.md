# AYNOR

The approved onboarding/dashboard frontend plus a Node 24 + SQLite backend for the first live Google Sheets reporting flow.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173/entry**. Local development skips login/signup with an explicitly enabled, unique HttpOnly session. Create a workspace, connect a private Google sheet or published CSV, map date/revenue/expenses, and open Overview for actual calculated metrics and charts.

Published CSV works without OAuth credentials. Private sheets require a Google Cloud OAuth client, read-only Sheets access and the server configuration documented in **[Live Sheets setup and architecture](docs/live-sheets.md)**. Do not paste credentials into chat or frontend files.

```sh
npm run build       # approved frontend, real API mode
npm test            # API, persistence, security, Sheets and production checks
npm run test:e2e    # real browser/API flow; controlled Google responses, temporary DB
```

The offline prototype is still [aynor-onboarding-frontend/index.html](aynor-onboarding-frontend/index.html). It does not contact the backend. Its editable source is in [aynor-onboarding-frontend/source](aynor-onboarding-frontend/source); running Vite there without `VITE_API_MODE=server` preserves prototype mode.

Sync polls Google on an interval (60 seconds by default), publishes browser events immediately after server updates and retains the last valid snapshot on failure. It does not receive instant cell-change notifications. Actual live Google access requires configuration and a source link; automated checks use controlled upstream responses.

This implementation is a **single-instance development MVP**, not a public production release. Development identity bypass is forbidden in production. Real production identity, external rollout and domain-specific live ingestion for the other intelligence modules remain subsequent work. The financial Overview uses live snapshots; other modules do not invent financial/project/people evidence from those records. See the architecture document for limits, storage, APIs, Google setup and deployment requirements.

For a first hosted pilot, see [Render setup](docs/render-setup.md). The repository
includes a paid-service blueprint with persistent storage and one-time owner
provisioning. Deploy the app and API together on Render initially; Vercel stays
unchanged until a separate proxy/domain configuration is tested.
