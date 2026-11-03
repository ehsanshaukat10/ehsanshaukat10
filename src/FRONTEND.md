# AYNOR frontend prototype

This is the current frontend-only handoff, superseding earlier server-oriented setup notes.

## Run without a backend

From the repository root:

```sh
npx vite --host 0.0.0.0
```

Only the frontend Vite server is needed. Do not use the older combined `npm run dev` command for this prototype; it starts the earlier server. Existing backend files and API configuration have deliberately been left untouched since the frontend-only scope correction.

Open the application and choose **Explore the prototype** to see three sample companies with different roles and setup statuses. Alternatively, create a fictional account and follow the new-company journey. Verification uses the sample code **123456**. Password inputs demonstrate validation and visibility; their values are discarded, never persisted.

All application responses come from `src/lib/mockService.ts`. This is browser-local mock state, not a backend, database, OAuth implementation, or authorization system. No `/api` requests are sent. Company state is stored under `aynor.frontend-prototype.v1` in localStorage; the selected sample persona uses sessionStorage. Data persists in the same browser, not across devices.

## Included interactions

- Signup, login, simulated Google account selection/cancellation, verification/resend, recovery, reset, and invitation context.
- Multiple company cards, search/sort, company creation/profile editing, switcher, different sample roles, incomplete/resumable workspaces, archive/leave confirmation.
- Department selection/customization/reordering/rename, priorities, simulated Google consent with denial/retry, sample source selection/search/preview, manual-link sample preview, discovery, editable field mapping, readiness, KPIs, and goals.
- Multiple invitation rows, roles and department scopes, partial/duplicate invitation feedback, local sample links, resend/revoke, incoming invitation acceptance/decline, and member-management UI.
- Per-company state, optional skips, save/finish-later, browser refresh persistence, unsaved-change dialog, retryable errors, disabled/loading controls, and limited-workspace completion.
- Reference-based split-screen authentication using original AYNOR artwork; responsive tablet/mobile composition, bundled Geist, keyboard focus/dialog behavior, and reduced-motion support.

The **Prototype** control in the corner opens sample companies, the invitation journey, next-action service/offline/slow-response states, session-expiry preview, and a confirmation-protected reset of prototype data.

## Frontend validation

With Vite running:

```sh
npm run build
node src/tests/prototype.browser.mjs
```

The browser script uses the installed Chromium executable (`/usr/bin/chromium`, overridable with `CHROMIUM_PATH`). It covers responsive layouts, simulated sign-in, complete onboarding, mapping confirmation, goals, invitations, invited-user entry, persistence, and recovery. It also asserts that there are **zero backend API requests**. Screenshots are saved outside the repository under `/tmp/aynor-frontend-preview`.

Earlier tests in `tests/api.test.js`, `tests/production.test.js`, and the older backend-dependent browser tests are from the superseded broader implementation. They are not the verification target for this frontend prototype and have not been modified after the scope correction.

## Later integration handoff — documentation only

Replace the local mock service with existing production service contracts in a separate backend integration task. Live account verification, OAuth, mail delivery, workspace permissions, spreadsheet discovery/validation, and intelligence need real services. The frontend demonstrates their UX states without claiming these capabilities exist. No backend configuration, database change, or service implementation is needed to review this prototype.

## Complete screen gallery

The application root and standalone `aynor.html` now open the complete 23-screen design gallery. Every gallery card opens an actual interactive screen with appropriate sample state. Choose **Walk through onboarding** to begin with company creation, or **Start with signup** for the authentication entry.

During previews, the persistent **All 23 screens / Previous / Next screen** navigator provides direct access to every design. Its screen-title dropdown lists the complete flow. Preview fixtures are browser-local and do not create real accounts or data connections.

Generate the standalone HTML with `node src/export-html.mjs`. Validate every screen entry using `node src/tests/screens.browser.mjs` while Vite is running. The separate `node src/tests/prototype.browser.mjs` still validates the functional user journeys.
