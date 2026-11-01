# Milestone 4B — Departments and Actions

4B only. No deployment, production SQL execution, AI recommendation integration, or changes to Dependencies, Goals or Ask Aynor. Existing semantic definitions, ingestion, mappings and Overview calculations remain unchanged. CSS, design tokens, header/sidebar components and navigation destinations are unchanged; business links now retain reporting context.

## Shared service and module behavior

Hosted Departments and Actions use `useCompanyIntelligence` and the server-side governed intelligence service. They do not call the prototype `useExecutive`, example records, browser-local task store or local metric calculations. Offline prototype/export behavior is retained separately; existing local tasks are neither deleted nor silently promoted to validated company data.

Departments lists authorized, configured departments, including empty departments. Each department presents its validated measures and shared business concerns. Source scopes are separate: identical metric names across different worksheets, currencies or periods are not added together. Measure links retain the selected source scope and lead to the same revision-bound evidence endpoint as Overview. Unsupported values are absent, never zero. Partial reports keep their supported measures; missing/unvalidated scopes are not described as healthy.

Actions converts the **existing shared presenter's validated concerns**, without another threshold engine, into transparent rule-based recommendations:

| Shared concern                 | Explanation and investigation                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overdue receivables            | Recorded outstanding balance is overdue; investigate contributing invoices and confirm follow-up. No predicted collection date.                             |
| Overdue projects               | Active records are past their confirmed due dates; investigate those records and confirm blocker/owner. No inferred owner.                                  |
| Planned utilization above 100% | Assigned demand exceeds available capacity in the confirmed period; investigate capacity and commitments. No severity score or claim of actual utilization. |
| Negative operating profit      | Validated expenses exceed revenue in the compatible scope; inspect contributing records. No invented cause.                                                 |

No other concern generates a recommendation in this milestone. The service returns what happened, why it matters, next investigation, the shared metric definition/value/period/currency and its dataset revision. Evidence access is checked again server-side, including column allowlists and permitted identity fields. User-written titles/notes remain explicitly user-created tasks, never validated findings.

## Interfaces

All routes require a current authenticated membership:

- `GET /api/companies/:company/intelligence`: unchanged shared report, plus authorized configured `departments` for module navigation.
- `GET /api/companies/:company/intelligence/actions`: accepts the existing reporting context (`scope`, `department`, `period`, repeated `tag`/`filter`, `q`, `status`). Returns `version`, `companyId`, `datasetRevision`, `authorization`, `context`, `items`.
- `POST .../intelligence/actions/tasks`: strict `{id?:UUID, version:integer, title, note?, scope?, department?, status?}`. Allowed statuses: Accepted, In Progress, Completed, Dismissed. Owner/Admin only. Scope determines the department when supplied. Unknown fields, including a client-supplied origin, are rejected.
- `POST .../intelligence/actions/decisions/:id`: strict `{version, evidenceRevision, status, note?, reason?}`. Owner/Admin only. ID must match a current server-generated recommendation and revision must match the current authorized dataset. Recommended is also a supported decision state.
- Writes return `{id, version}`. Optimistic version conflicts or changed source/configuration return 409; unauthorized writes return 403. New tasks use a stable client UUID, allowing identical create retries without duplicates.

`withAuthorizedState` is an internal trusted-server callback over one coherent membership/company/source/action read. It exposes the existing calculated report, policy, stored action records and a write fence. Raw state, policy and records are not returned directly to the browser. No new calculation engine or persistent intelligence cache is introduced.

## Persistence, isolation and revisions

`supabase/migrations/202611010002_governed_actions.sql` is a **review artifact requiring approval before application**. It creates `aynor_action_records`, extends the server-only coherent read and adds `aynor_action_write`. Browser SQL roles have no table or RPC access. Until this migration is applied in an approved environment, action writes cannot be activated there. Local tests apply it only to isolated PGlite databases.

Records are company-bound, versioned and audit logged. The SQL write locks the same company row used by source/configuration writes, rechecks Owner/Admin membership and compares company version, source generation/revision and snapshot revision/creation against the service's read. This prevents a source or permission/configuration race from committing a decision against obsolete authority. Task/decision kind cannot change. The MVP cap is 500 saved records per company.

Readers inherit 4A's explicit category/sensitivity grants and department restrictions. Executive does not imply financial/payroll access. Historical task/decision visibility additionally requires the original saved scope, department, category and sensitivity envelope, as well as current scope access. Unlinked/unclassified manual tasks are administrator-only. No row-level ACLs or automatic sensitive-text classification are introduced.

Recommendation IDs use company, scope, metric, confirmed period, currency and entity namespace. Decisions persist across syncs; changed contributing values/rows are flagged for review. When a concern is no longer supported, its saved decision becomes historical/read-only. It is **not** asserted resolved. Historical summaries retain the original revision; current source rows are never passed off as historical proof. Changed undated data still follows the existing explicit scope reconfirmation rule. We do not retain a new archive of old source rows.

## Context and states

Company stays in the route. Department, source scope, reporting period, repeated filters/tags, query and status survive business navigation. Approved same-company return paths restore the investigation after evidence or mapping correction; external/cross-company returns are rejected. Department detail routes enforce their department server-side even if the query is manually altered.

As in 4A, a period/filter URL is retained context, not an instruction to silently recompute a different period. Displayed metrics always show their confirmed semantic period. Scope and department select authorized facts; Actions additionally filters task status/search. Arbitrary cross-period aggregation is unsupported.

The shared cache is authorized before display and keyed by user/company/permissions/context/source revision. Action views are component-memory only and must match the shared authority/context/revision. Same-context refreshes keep visible rows while loading. Failed authorization or mismatched revisions do not keep potentially unauthorized action data. Failed task writes retain the input for retry; there is one action-read retry control. Empty, missing, partial, unavailable-action and historical states are explicit. Mobile uses the approved responsive components.

## Verification

- `tests/departments-actions.test.js`: real application + isolated SQL database. Exact Overview/department/recommendation/evidence parity; finance, delivery and resource facts; persisted task and decision restart; immutable origins; idempotent creation; version conflicts; source-write race; changed/removed evidence and reconfirmation; Viewer/Manager/Executive scoping; tenant isolation; direct browser SQL denial.
- `tests/dashboard-navigation.test.js`: period/scope/repeated filters, contextual evidence/mapping returns, company isolation and unsafe destination rejection.
- `tests/departments-actions.browser.mjs`: actual mapping department assignment; department/metric/evidence/return journeys; system decision and manual task persistence; separate origins; supported identity evidence; partial/empty/error/retry/updating states; 390/768/1440px overflow assertions and desktop/mobile screenshots.
- Existing 4A authorization/cache and semantic-engine tests remain in the full regression suite. Existing browser journeys cover auth, ingestion, mapping, Overview, evidence, permission changes and UX stabilization.

## Remaining limitations and review risks

- Owner/Admin writes only; managers/executives/viewers investigate authorized data. There is no new task assignment, notification, deletion, due-date or collaboration workflow.
- Tasks linked to a reporting scope inherit its confidentiality envelope; unlinked tasks are administrator-only. No automatic inspection of sensitive free text.
- Rules are deliberately limited to the shared presenter's four supported concerns. No inferred causes, relationships, forecasts, entity joins or generative recommendations.
- A completed recommendation records a user decision, not a verified business resolution. Source truth controls whether the concern remains current.
- Semantic periods remain explicitly confirmed; calendar filters do not fabricate new calculations. No cross-source rollups beyond the approved engine.
- Production activation requires separately approved migration and deployment. Local fixtures do not demonstrate production tenant grants or live Google synchronization.
- Shared-component type narrowing and contextual link helpers are regression-sensitive; the full existing browser suite is included. Production bundle retains its existing size warning; this milestone adds no chart, AI or UI framework.

## Recorded verification results

Final local verification: **88 automated tests passed**, **14 serverless browser journeys passed**, TypeScript project build passed, and the production-mode Vite build passed with its existing bundle-size warning. A focused service rerun also passed after adding explicit manual-task/historical-decision visibility assertions. The CSS output hash remains `index-dH7GHMWQ.css`.

Review artifacts, screenshots and the full changed-file inventory are in `/workspace/artifacts/milestone-4b/README.md`. No deployment or production migration was performed. Stop here for 4B review.
