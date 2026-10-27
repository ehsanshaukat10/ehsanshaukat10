# First hosted pilot on Render

Run the approved app and backend together on one Render Web Service first. Keep the existing Vercel project unchanged. Using the Render address for this first pilot keeps API requests, secure cookies and Google callbacks on one origin; Vercel is not connected to the backend by this change.

## Dashboard steps

1. In Render choose **New → Blueprint** and connect GitHub if prompted.
2. Choose **ehsanshaukat10/ehsanshaukat10**, branch **main**. Render should find `render.yaml` at the repository root.
3. Enter your email for `INITIAL_OWNER_EMAIL`. Render generates `INITIAL_OWNER_PASSWORD` privately; do not paste it into chat or GitHub.
4. Review the displayed charges: the blueprint requests a **Starter Web Service and a 1 GB persistent disk**. This is a paid configuration. Check the current price in Render before choosing Deploy; no purchase is made by adding the blueprint to GitHub. Free services without a disk are unsuitable for this SQLite backend.
5. Deploy. Wait until the service is **Live**. Its address looks like `https://aynor-....onrender.com`.
6. Open the service's **Environment** settings and copy/reveal the generated `INITIAL_OWNER_PASSWORD`. Save it in a password manager. Open your Render site at `/auth/login` and sign in using your chosen email and that password.
7. Create a workspace. Go to Data connections, choose **Published sheet**, and use a published CSV link to test the first live report.

The initial owner is provisioned once into the persistent database. Subsequent starts do not reset its password or change existing accounts. Public signup, email delivery and development-session bypass remain disabled in production. This is an operator-provisioned pilot account, not completed public signup/authentication onboarding.

After confirming sign-in and securely saving the password, remove **both** `INITIAL_OWNER_EMAIL` and `INITIAL_OWNER_PASSWORD` from Render's environment, then redeploy. Removing them does not delete the saved account. Never leave only one set. If applying this blueprint again later, review whether Render proposes reintroducing those values. Password recovery email is not implemented yet, so retain your password securely; do not delete the persistent disk.

## First Google test

Use File → Share → Publish to web in Google Sheets and select CSV. Publishing makes that tab public; use non-sensitive test data. Paste the resulting `https://docs.google.com/spreadsheets/d/e/.../pub?output=csv&gid=...` link. Use columns for ISO date (`YYYY-MM-DD`), revenue and operating expenses. Map them and wait for the first successful sync.

Private Google Sheets require a Google Cloud OAuth client and the additional server environment variables in [live-sheets.md](live-sheets.md). Register the callback on the Render address, e.g. `https://YOUR-SERVICE.onrender.com/api/integrations/google/callback`. Do not use the localhost callback on a hosted service.

## Operational boundaries

- The disk at `/var/data` holds SQLite data across restarts/deploys. Deleting the disk deletes workspaces, credentials and accounts. Backups/recovery must be configured and tested before important data is used.
- Use one instance. This MVP does not support multiple independent schedulers or replicated SQLite workers. Disk-backed deployments can have brief downtime.
- Auto deploy is disabled in the blueprint. Deploy deliberate, tested revisions from Render when ready.
- The `/healthz` check reports readiness without exposing user data or configuration secrets.
- The live financial Overview is connected; the other intelligence modules still have the integration limits documented in the architecture guide. No production AI is introduced.
- This prepares deployment; it does not create a Render resource, authorize charges, verify your Render account or connect your existing Vercel URL. Start with the Render URL. Moving the existing public frontend later requires an explicit same-origin API proxy/custom-domain plan and cookie/OAuth testing.
