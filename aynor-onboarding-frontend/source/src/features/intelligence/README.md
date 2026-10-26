# AYNOR MVP frontend

Dedicated modules extend the approved Overview without redesigning it. All paths are company-scoped under `/companies/:companyId`:

- `/departments`, `/:department`, `/:department/metrics/:metric`
- `/dependencies`, `/dependencies/:entity` (query filters and graph zoom)
- `/goals`, `/goals/new`, `/goals/:id`, `/goals/:id/edit`
- `/actions`, `/actions/:id`
- `/ask`, `/ask/:conversationId`
- `/settings/profile`, `/settings/departments`, `/settings/connections`, `/settings/preferences`
- Existing `/members` retains team and invitation workflows.

See [UX-AUDIT.md](UX-AUDIT.md) for the initial screen-by-screen gap audit and UX contracts.

## Data and boundaries

Existing browser mock services handle company profiles, goals and setup. Supplemental tracking metadata, action decisions, conversation history and simulated connection status live in localStorage keyed by user and company. Forms keep recoverable session drafts. Reporting preferences reuse the Overview preference store. Links preserve reporting period, explicit evidence scenario and a validated same-company origin; list filters and graph zoom live in the URL.

Assistant responses are deterministic simulations over available illustrative records, with source links and calculations. Connected goals require a compatible metric and reporting period. Missing fields, unsupported measures and absent history remain unavailable. Completing an action records a user decision; it does not resolve the source warning. Actual uploaded business records are not analyzed by these modules.

Refresh/reconnect do not contact Google. No real AI, email, payment, database, server authorization or external write is performed. Browser role restrictions demonstrate the intended UI only; backend enforcement and validated production records remain future integration work. Profile updates reuse existing mock contracts; authentication changes are limited to preserving a safe frontend return route.

## Checks

Run Vite on port 5175, then:

```
node src/tests/mvp.browser.mjs
node src/tests/mvp-states.browser.mjs
node src/tests/dashboard.browser.mjs
node src/tests/shell.browser.mjs
node src/tests/onboarding-empty.browser.mjs
npm run test:frontend
node src/tests/dashboard-model.mjs
npm run build
```

MVP browser checks cover the seven requested journeys, 390/768/1920px layouts, errors and zero backend requests. State checks cover missing/unmapped/scoped data, recoverable writes, goal drafts/validation, conversation failure and connection recovery. The Overview, shell, skipped onboarding and existing onboarding/authentication regressions remain covered separately.

Development QA switches: `?write=error` fails the next local write once, `?response=error` fails simulated generation once, and connection settings support `?sync=expired` or `?sync=error`. Source scenarios retain the existing Overview `?state=...` controls. These are QA simulations, not production APIs.

For standalone delivery, run `node src/export-html.mjs` and copy the generated `aynor.html` to the folder's `index.html`. Hash routing supports direct local HTML use; development uses BrowserRouter. The browser suite also accepts `PROTOTYPE_URL=http://127.0.0.1:5175/dist/standalone-preview.html#` to validate the exported artifact over HTTP.
