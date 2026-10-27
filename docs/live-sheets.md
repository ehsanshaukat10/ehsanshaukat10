# Live Sheets: first backend vertical slice

## What runs now

The approved React frontend can opt into the existing Node/SQLite API. The default standalone HTML remains an offline prototype. Server mode supports real company persistence, read-only private Google Sheets OAuth, published CSV access, column inspection/mapping, validated snapshots, scheduled synchronization, browser sync events and a real financial Overview.

This is a single-process MVP, not a public production release. Real login/signup remains deferred. The development session requires explicit enablement, a loopback connection and a localhost Host; production rejects it even if its flag is set. It creates a unique identity with a random HttpOnly session, not a shared demo account. Cookie loss/expiry requires a new development identity; this is not a substitute for production account recovery. Do not expose the development server through a public tunnel.

## Run

Node 24+ is required. From the repository root:

```
npm ci
cp .env.example .env
npm run dev
```

Visit `http://127.0.0.1:5173/entry`. Development bypasses the auth screens and opens workspace creation or your existing workspace. The launcher reads root `.env`; secrets are never placed in Vite-prefixed variables. Vite proxies `/api` to Node on 3001. Custom API ports require updating the proxy target via `AYNOR_API_URL`.

For private sheets:

1. Enable Google Sheets API in a Google Cloud project.
2. Configure its OAuth consent screen and add your account as a test user while the application is in testing.
3. Create a Web Application OAuth client and register exactly `http://127.0.0.1:5173/api/integrations/google/callback` as an authorized redirect URI.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and a stable 64-character hexadecimal `SHEETS_ENCRYPTION_KEY` in root `.env`.
5. Restart the server. In onboarding or Settings → Data connections, select Private sheet, authorize Google, paste a sheet URL, read columns, choose a tab and map the three fields.

Only `spreadsheets.readonly` is requested. File listing/Drive access is deliberately unnecessary; use a spreadsheet URL or ID. Access tokens and offline refresh tokens stay on the server, encrypted with AES-256-GCM. OAuth state is short-lived, single-use and bound to both the signed-in user and company. A revoked grant requires reconnection. Disconnect removes stored credentials and snapshots; it does not globally revoke the Google app grant.

For public sheets:

1. In Google Sheets select File → Share → Publish to web.
2. Select one tab and CSV output, then publish.
3. Use its `https://docs.google.com/spreadsheets/d/e/.../pub?output=csv&gid=...` link under Published sheet.
4. Read columns and map fields. OAuth credentials are not required.

A merely shared/private URL is not a published CSV source. Publishing makes data public; use OAuth for private company information. Google may cache published exports, so source publication freshness is outside Aynor's control. Public redirects are followed only to allowlisted HTTPS Google export hosts; arbitrary URLs, credentials in URLs and non-Google destinations are rejected.

## Data contract

The first live dataset is a financial fact table with three distinct, named columns:

- `date`: plain ISO `YYYY-MM-DD` values; invalid dates fail validation.
- `revenue`: numeric amount, optionally grouped with commas, decimal point, no symbols/formulas/errors.
- `expenses`: the same numeric contract, in the company currency.

One record per row. Duplicate dates represent separate records and are summed into daily totals. All financial inputs are interpreted as amounts in the workspace currency; there is no exchange-rate conversion. Negative amounts are permitted for reversals and displayed against a zero baseline. Amounts round to two decimals; sums use integer minor units and reject unsafe aggregate magnitudes. This slice assumes a two-decimal reporting currency. Empty fields do not become zero. Blank rows are skipped.

Limits: 52 header columns, 10,000 records, 5 MB source response, 20-second request timeouts. Headers must be unique and nonempty. Larger inputs are rejected rather than silently truncated. Formula results are read, not executed by Aynor. Actual row identifiers, departments and project/person relationships are not inferred from finance columns.

Reports cover the last complete UTC calendar month, quarter (three months) or year. The upper date bound is exclusive; the current partial month is excluded. Dates outside the chosen window remain stored but do not inflate reported results. No dates in a period produce an explicit empty state. Revenue, expenses, profit and margin derive from validated rows; zero revenue makes margin unavailable.

## Architecture and sync semantics

```
React server mode → same-origin API → company membership check
  → public CSV reader OR Google read-only token refresh + Sheets API
  → bounded fetch → header/row validation → atomic SQLite snapshot
  → SSE status notification → browser reloads authorized report
```

- The existing company/session/membership system remains the authority. Only Owner/Admin can manage this initial company-wide financial source or read its report. A scoped role cannot read a full-company snapshot.
- One source/tab per company in this slice. Connecting a different public source or changing mapping invalidates its previous snapshot. Reconnection and source removal cannot let an in-flight sync resurrect deleted data.
- `sheet_connections` stores credentials/source config/status/revision. `sheet_snapshots` stores only normalized daily totals and record counts. `sheet_oauth` stores hashed pending consent state. No API response or event exposes credentials or raw source rows.
- Credentials are encrypted; financial snapshots reside in the SQLite database and require protected storage and backups. Keep `DATA_DIR` durable. Keep the encryption key independently protected and backed up. Key rotation/recovery is not automatic.
- Sync uses a per-company single-flight job. Token refresh is also single-flight. Browser requests do not create duplicate upstream reads while a job is running. Failed reads never replace the last valid snapshot.
- Automatic source reads run approximately every 60 seconds by default, with a 30-second minimum. Google failures use bounded exponential retry up to 15 minutes; revoked credentials pause until reauthorized. Manual sync has a cooldown.
- SSE delivers state changes to the browser immediately after server changes; a 15-second status poll recovers interrupted event delivery. Membership is rechecked on events and heartbeats, and expired/revoked sessions close streams.
- Google Sheets does not push cell edits through this integration. End-to-end freshness is the poll interval plus upstream/cache/processing latency. Do not label it instantaneous or guarantee second-by-second synchronization.
- A single Node process owns the scheduler and SQLite writes. Do not scale to multiple independent workers/replicas without a shared durable database, distributed job leases and shared events. SQLite WAL supports this bounded single-instance MVP.

## API

All routes require the company session/membership unless noted.

| Method | Route | Result |
|---|---|---|
| POST | `/api/dev/session` | Unique, explicitly enabled localhost development identity; unavailable in production |
| GET | `/api/companies/:id/sheets` | Connection/freshness/status; no secrets |
| POST | `.../sheets/authorize` | Google consent URL |
| GET | `/api/integrations/google/callback` | Bound, single-use authorization callback |
| POST | `.../sheets/public` | Inspect/connect a published CSV source |
| POST | `.../sheets/inspect` | Inspect private spreadsheet metadata and selected tab headers |
| PUT | `.../sheets/mapping` | Save date/revenue/expenses mapping and request first sync |
| POST | `.../sheets/sync` | Request a single-flight sync; returns 202 |
| GET | `.../sheets/overview?period=quarter` | Authorized report plus source status |
| GET | `.../sheets/events` | Credential-free SSE sync metadata |
| DELETE | `.../sheets` | Remove source, mapping, credentials and snapshot |

## Verification and integration limits

```
npm run build
npm test
npm run test:e2e
```

Tests use temporary databases and controlled Google responses. They cover private authorization/refresh, public CSV ingestion, unsafe URLs/redirects, malformed data, failed sync retention, concurrency, scope isolation, expired access, retry backoff, production development-session denial and real browser/API persistence/calculations/events. A live Google smoke test still requires actual OAuth configuration or a published link; passing controlled tests is not evidence that a particular Google project or sheet is configured correctly.

Live data currently powers the financial Overview. The other intelligence modules retain honest unavailable states in server mode and do not silently substitute illustrative data. Their domain-specific ingestion/calculations, persistent action/conversation metadata, connected-goal evaluation and production AI are subsequent work. Existing mock authentication, integrations and sample data remain available only in the separate offline prototype.

For a production build, `npm run build` compiles server-mode frontend assets and `npm start` serves them with the API. HTTPS, durable storage, real identity provisioning/login/recovery, operational monitoring/backups and Google consent verification (as applicable) are required before external rollout. A static Vercel deployment alone cannot run this long-lived SQLite scheduler/SSE server. No deployment is performed by this change.
