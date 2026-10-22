# AYNOR frontend prototype

This version restores the uploaded detailed onboarding with a new Home entry and a quieter split composition.

From `aynor-onboarding-frontend/source`, run `npm ci` then `npm run dev`. Only Vite is required. Alternatively, open the distribution's `index.html` directly; application code, styles and fonts are embedded.

## Journey

Home offers Log in, Create account and Skip for now. Skip creates a browser-local guest persona and opens company creation. Returning guests can resume their workspace or choose authentication. Verification uses the sample code **123456**. Password inputs demonstrate validation; passwords are discarded rather than persisted.

The detailed flow remains company → departments → priorities → integrations → sources → discovery → mapping → readiness → KPIs → goals → invite → review → complete → dashboard. Optional steps can be skipped. Refresh preserves form drafts. Back, save for later and resume preserve company progress.

Authentication keeps the reference-inspired split composition. Onboarding removes the sidebar and places original illustrative cards on the right. Smaller screens focus on the form. The dashboard and member management retain workspace navigation and multi-company functionality. The separate screen gallery remains available at `/prototype`, without a floating screen navigator during onboarding.

All responses come from `src/lib/mockService.ts`. Its API-shaped helper is an in-browser mock, not a network API. There are no backend requests. Companies persist under `aynor.frontend-prototype.v1` in localStorage; persona selection and drafts use sessionStorage. Google consent, spreadsheet discovery, invitations and email actions are clearly simulated.

The workspace's Prototype control provides sample companies, sample invitation, next-action failure and slow-response states, expiry preview and a confirmation-protected local reset. It is hidden during Home, authentication and onboarding.

## Validation and export

With Vite running:

```sh
npm run build
npm run test:frontend
```

Use `PROTOTYPE_URL` to override the browser test target (default `http://127.0.0.1:5173`). Chromium is expected at `/usr/bin/chromium`, overridable with `CHROMIUM_PATH`. Tests cover entry choices, full detailed onboarding, invitation signup, saved progress, optional skips and desktop/tablet/mobile overflow. They assert zero backend API requests.

Generate the standalone distribution with `node src/export-html.mjs`, then copy generated `aynor.html` to `../index.html`. The standalone uses hash routing so it can be opened directly without a server.

## Integration boundary

Changes are limited to frontend source, tests, documentation and the standalone distribution. Existing backend files, database code, API/authentication configuration and production infrastructure are untouched. Live verification, email, OAuth, permissions and Sheets integration require a separate integration task; this prototype only demonstrates their UI states.

## Visual refinement

Authentication and onboarding use an edge-to-edge 60/40 desktop split, collapsing to a focused single column on smaller devices. Supporting UI text has a 14px minimum, body copy is 16px, and form fields use 16px to prevent mobile input zoom. The landing page has a separate corporate composition. Onboarding illustrations change by stage and reflect entered company details and selected departments, priorities, mapping, KPIs and goals. Short entrance/selection transitions respect reduced-motion preferences. Repeated prototype/adapter banners have been removed; connection consent dialogs retain an explicit simulation disclosure.
