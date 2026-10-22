# AYNOR frontend prototype

Run `npm ci` and `npm run dev` from `aynor-onboarding-frontend/source`. Only Vite is needed. The distribution `index.html` also opens directly without a server.

## Seven-step journey

Home → login/signup or guest skip → company → departments → connect data sheets → mapping → business priorities → goals → review → completion → workspace.

Company details include name, industry, website, size, country, city, business model, time zone and currency. Departments support existing and custom selections without the old arrange/refine panel. One connection screen supports Google Sheets consent, local CSV/TSV/JSON upload (5 MB maximum), and URL entry. File uploads read headers locally, including quoted CSV headers. Google and URL connections clearly disclose their simulation. Replacing a source replaces its mappings.

Mapping fields, department assignments and meanings are editable. Mapping, priorities and goals can be skipped. Priorities support custom entries. Goals are added, edited and deleted directly on the page. Review displays six icon-led detail sections with edit links; edits save directly back to review. The company section shows all nine fields. The standalone completion screen follows step 7 and is not an eighth onboarding step.

The removed source selection, discovery, readiness, KPI and collaborator steps no longer appear in onboarding. Existing workspace member-management and invitation acceptance remain available outside onboarding. Old browser-local step names and deep links resolve to the nearest retained step.

Google Sans Flex is bundled locally from Google Fonts' official repository under the SIL Open Font License, including the standalone export. The local font retains variable weights; other axes are fixed for consistent rendering. The original blue palette, 60/40 desktop composition and single-column mobile layout are preserved.

## Local state and boundaries

All application responses come from `src/lib/mockService.ts`. The API-shaped helper sends no network API requests. Company state is stored under `aynor.frontend-prototype.v1` in localStorage; persona selection and drafts use sessionStorage. Passwords are discarded rather than persisted. Verification code: **123456**.

Only frontend files, browser checks, documentation and the standalone distribution change. Backend services, database code and API/authentication configuration are untouched. Real authentication, OAuth, email, permissions and Sheets access require a separate integration task.

## Validate and export

With Vite running, use `npm run build` and `npm run test:frontend`. Tests expect Chromium at `/usr/bin/chromium`, overridable with `CHROMIUM_PATH`. Set `PROTOTYPE_URL` if the frontend runs on a port other than 5173. Coverage includes all seven steps, uploads, mapping validation, goals, review edit routes, optional skips, saved drafts, source errors, old routes and responsive typography/layout. Tests assert zero backend API requests.

Generate standalone HTML with `node src/export-html.mjs`, then copy `aynor.html` to `../index.html`. Hash routing allows direct browser access without a server. Google Sans Flex's license is included in `src/assets/fonts/OFL-GoogleSansFlex.txt`.
