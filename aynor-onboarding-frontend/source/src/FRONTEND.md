# AYNOR frontend prototype

Run `npm ci` and `npm run dev` from `aynor-onboarding-frontend/source`. Only Vite is needed. The distribution `index.html` also opens directly without a server.

## Seven-step journey

Home → login/signup or guest skip → company → departments → connect data sheets → mapping → business priorities → goals → review → completion → workspace.

Company details include name, industry, website, size, country and business model. Departments support existing and custom selections without the old arrange/refine panel. One connection screen supports Google Sheets consent, local CSV/TSV/JSON upload (5 MB maximum), and URL entry. File uploads read headers locally, including quoted CSV headers. Google and URL connections clearly disclose their simulation. Replacing a source replaces its mappings.

Mapping fields, department assignments and meanings are editable. Mapping, priorities and goals can be skipped. Priorities support custom entries. Goals are added, edited and deleted directly on the page. Review displays six icon-led detail sections with edit links; edits save directly back to review. The company section shows all six fields. The standalone completion screen follows step 7 and is not an eighth onboarding step.

The removed source selection, discovery, readiness, KPI and collaborator steps no longer appear in onboarding. Existing workspace member-management and invitation acceptance remain available outside onboarding. Old browser-local step names and deep links resolve to the nearest retained step.

The original Geist font is restored. Related company and goal inputs use compact responsive grids. Onboarding entry opens the latest editable incomplete workspace directly, or the existing dashboard when setup is complete; company management remains available in the workspace.

## Local state and boundaries

All application responses come from `src/lib/mockService.ts`. The API-shaped helper sends no network API requests. Company state is stored under `aynor.frontend-prototype.v1` in localStorage; persona selection and drafts use sessionStorage. Passwords are discarded rather than persisted. Verification code: **123456**.

Only frontend files, browser checks, documentation and the standalone distribution change. Backend services, database code and API/authentication configuration are untouched. Real authentication, OAuth, email, permissions and Sheets access require a separate integration task.

## Validate and export

With Vite running, use `npm run build` and `npm run test:frontend`. Tests expect Chromium at `/usr/bin/chromium`, overridable with `CHROMIUM_PATH`. Set `PROTOTYPE_URL` if the frontend runs on a port other than 5173. Coverage includes all seven steps, uploads, mapping validation, goals, review edit routes, optional skips, saved drafts, source errors, old routes and responsive typography/layout. Tests assert zero backend API requests.

Generate standalone HTML with `node src/export-html.mjs`, then copy `aynor.html` to `../index.html`. Hash routing allows direct browser access without a server.

## Authentication and completion refinement

Login and signup use viewport-height layouts with compact spacing on shorter screens. Supporting labels remain accessible when visually condensed; all primary fields and entry actions fit the tested desktop, tablet and portrait mobile viewports. Their “Skip for now · continue to onboarding” action always opens `/companies/new`, including when the guest already has a completed workspace. Home's guest continuation retains its existing resume behavior.

Completion uses the earlier centered design: a checkmark tile, “Make room for better decisions,” company-specific copy, workspace status and a single Open dashboard action. The duplicate readiness heading and right-hand illustration are omitted on completion. The seven-step review remains intact before completion.

## Compact onboarding

Supporting text and department/priority cards use smaller regular-weight styling. Mapping displays one field at a time with Previous/Next controls; Continue directs validation to the first unfinished field. The review uses compact summary cards with expandable details and keeps each step's edit link. This avoids long default forms without clipping content; expanded details, extra custom entries and smaller screens can still scroll as needed. Company website fields accept a bare domain and add the protocol internally, while invalid addresses show an inline error. The divider above the company form actions is removed.
