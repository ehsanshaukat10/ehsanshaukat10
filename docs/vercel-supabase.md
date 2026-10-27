# Vercel + Supabase: manual-sync pilot

This deployment uses the existing Vercel root `aynor-onboarding-frontend/source`. All function code and its runtime dependencies are inside that directory. `api/handler.js` is a Node function; `vercel.json` routes `/api/*` to it and preserves SPA deep links. No SQLite, local disk, persistent worker, SSE server or background jobs are used by this path. The older SQLite/Render/local path remains available independently.

## Activation, one step at a time

1. Run `supabase/migrations/202610270001_aynor_foundation.sql` in Supabase SQL Editor. This was the first setup script.
2. Run `supabase/migrations/202610270002_serverless_operations.sql`. Expected result: **AYNOR serverless setup complete**. It adds backend-only atomic operations and sync leases; it does not remove existing records. Run the complete file, not a selected fragment.
3. In Vercel's Production environment, keep `SUPABASE_URL` as the bare project HTTPS address and `SUPABASE_SECRET_KEY` as a Secret. Never use the publishable key in that variable. No database connection string, IPv4 add-on, paid persistent disk or Render account is needed.
4. Add `INITIAL_OWNER_EMAIL` (your email) and `INITIAL_OWNER_PASSWORD` (a new private strong password, 16–200 characters) as server variables. Make the password Secret. This operator-provisions a verified pilot identity; it does not enable public signup or send email. An existing account/password is never overwritten.
5. Add `VITE_API_MODE=server` as Config in Production. **This is the deliberate frontend activation switch.** Without it Vercel continues to build the offline prototype; adding only Supabase variables does not change that. Never give credentials a `VITE_` prefix.
6. Redeploy the latest tested `main` revision. Keep Root Directory `aynor-onboarding-frontend/source`, Vite preset and output `dist`. Vercel reads `vercel.json` from that root. Node 24.x is declared in its package. Do not change the root to the repository root.
7. Visit `/api/health` on the actual deployment. Expected JSON: `{"status":"ok","storage":"supabase","syncMode":"manual"}`. Then visit `/auth/login`, sign in using the owner credentials, and create a workspace. The health check needs the second setup script and the correct server secret but does not reveal those values.
8. Test a non-sensitive published CSV sheet first. Map date/revenue/expenses and save. Mapping performs the first read within the request; subsequent changes require **Sync now**. Reports persist across function cold starts and browser reloads.
9. Once sign-in works and the password is saved in a password manager, remove **both** `INITIAL_OWNER_EMAIL` and `INITIAL_OWNER_PASSWORD` and redeploy. The stored account remains. Password recovery email is not implemented; retain that password securely.

Do not share secrets in screenshots/chat. The SQL files contain no credentials and can be shared. Missing setup/config produces an explicit error; it never silently changes to demo financial data.

## Private sheets

Public CSV needs no Google OAuth credentials. Private sheets additionally need server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and stable `SHEETS_ENCRYPTION_KEY` (64 hexadecimal characters). Register the callback on the actual production domain: `https://YOUR-DOMAIN/api/integrations/google/callback`. The browser must stay on that same hostname through consent so its session cookie returns. Configure Google consent test users and enable Sheets API.

Only spreadsheet read scope is requested. OAuth state is hashed, user/company-bound, expiring and consumed once. Stored tokens use AES-256-GCM; refresh uses a credential compare-and-swap so another connection cannot be overwritten. Google errors do not expire the app session. No key or source credential is returned by the API.

## Consistency and access

The HTTPS adapter uses the Supabase server secret in `apikey`. Modern `sb_secret_` keys are not treated as JWT bearer tokens. All data access is server-side. Browser roles have no table or RPC privileges; service-role SQL functions are SECURITY INVOKER and explicitly deny PUBLIC/anon/authenticated execution. The API must authenticate the user and pass the trusted actor ID. Database-side membership checks protect atomic mutations; company-wide financial reports are Owner/Admin only.

Company creation, owner membership, audit and idempotency results commit together. Workspace/profile changes check a locked current version. Permission changes reject ownership changes and invalid scopes. Invitation acceptance checks identity/expiry/status atomically. Outbound email and public registration remain disabled in hosted mode, matching the previous production boundary.

Each manual sync claims a durable PostgreSQL lease. Another function cannot claim an active sync. Lease expiry allows recovery after a function is terminated. Source generation and lease IDs guard publication, so removed/remapped sources cannot be overwritten by old requests. Source changes invalidate old snapshots atomically. Failed validation/provider reads retain the last valid snapshot. Company membership is checked again on publication. There is no fire-and-forget work after the function responds.

The browser refreshes connection status and immediately reloads after a local mutation. It opens no SSE stream in manual mode. A database error, revoked provider token, active sync, cooldown, missing mapping and empty reporting period all have explicit UI/API responses. Source freshness older than one day is labeled stale; it is not a promise of automatic polling of Google.

Input/size/date/currency rules match the local live slice: ISO dates, numeric amounts in the workspace currency, 52 columns, 10,000 rows, 5 MB, integer-minor-unit sums, complete UTC calendar reporting periods, and no fabricated comparisons. The function has a 60-second maximum; individual upstream reads time out sooner. Long requests that are terminated before publishing keep the last snapshot; retry after the lease expires (two minutes).

## Limits and migration

This changes the application's storage path; it does **not** automatically import old SQLite files or browser prototype state. Those remain untouched. The current Supabase project was initialized empty. Existing real SQLite data needs a separate deliberate export/import with ownership checks before switching a populated deployment.

The live financial Overview is connected. The other intelligence modules retain their documented integration limits; AI, actions and goal-tracking metadata are not magically promoted to production persistence. This remains an owner-provisioned pilot, not unrestricted public onboarding. Free-provider quotas and plan eligibility still apply; manual sync avoids a paid always-on worker but is not an unlimited hosting guarantee.

## Verification

`npm test` covers both original backend tests and the new API against the actual PostgreSQL migration in an isolated PGlite engine. A test HTTP adapter simulates Supabase PostgREST and controlled Google responses. Coverage includes durable identity across application instances, cross-company denial, version conflicts, idempotency, RLS/RPC restrictions, manual reporting, validation failure retention, active leases, removed sources, OAuth/refresh/revocation, and logout. This validates SQL/API behavior, not the user's live Supabase gateway or Vercel account.

`npm run test:serverless` runs Chromium against the serverless application plus PostgreSQL fixture. It verifies actual form/API navigation, persisted metrics, manual sync language, no event-stream requests, mobile/tablet/wide layouts and disconnect. `npm run test:e2e` retains the original local backend browser checks. The live cloud health and sheet smoke test still require the user's deployment and credentials; they have not been claimed as already completed.
