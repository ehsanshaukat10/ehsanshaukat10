# Milestone 4D — Goals

4D only. Hosted Goals now uses the shared governed intelligence service, not example metrics, the prototype `goalValue`, browser-local goal calculations or local-storage tracking. Ask Aynor is unchanged. Overview, Departments, Actions, Dependencies, source ingestion, semantic mappings and KPI formulas remain unchanged. No production deployment or migration was performed.

## Business behavior

An Owner/Admin can create a company-level or department-level goal with a title, one supported semantic metric and reporting scope, target value, unit/currency context, exact reporting period, deadline, optional owner text, direction and lifecycle status. Department goals must match a configured department assigned to their metric source. A company goal is a company-defined target against **one governed metric scope**, not an automatic aggregation of unrelated departmental worksheets.

The detail view separates **target**, **validated actual**, **change progress or threshold assessment**, and **administrator-managed lifecycle**. Existing approved ModulePage, cards, Panel, Status, fields, buttons, Blank and Modal components are reused. No CSS, design tokens, typography, colors, header/sidebar styling or navigation destinations changed.

### Assessment rules

The actual must be validated, finite and compatible with the goal's physical worksheet scope, confirmed entity/namespace binding, source department, unit, currency context and exact semantic period. Freshness, identifier, overlap and source validation come from the existing semantic engine. Goals does not reimplement those calculations. Missing, stale, disabled, unconfirmed, incompatible or changed-identity data produces **Unassessed**, `actual: null`, `progress: null`, an explanation and a relevant review action. Missing values never become zero.

| Goal direction     | Target assessment                               | Numeric change progress                                          |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------- |
| Increase           | Actual ≥ target                                 | `(actual − baseline) / (target − baseline) × 100`                |
| Reduce             | Actual ≤ target                                 | Same directed-change formula, with target < baseline             |
| Maintain threshold | Explicit **at least** or **at most** comparison | No invented percentage; current-period threshold assessment only |

The baseline is an optional, explicitly administrator-confirmed reference value. It is not inferred from historical records. Without a baseline, actual/target comparison still works, but a change percentage is not calculated. Increase/reduce targets must improve on their baseline when one is provided. Count targets/baselines must be nonnegative safe integers. Zero targets, baselines and actuals are supported, including reducing to zero without dividing by the target. Percentages can exceed 100% or be negative when the measured change exceeds the target or moves away from it; they are not silently capped. Unsupported numeric precision yields no numeric change percentage.

Percentage **metric units** and **change progress** are different. For example, a margin actual of 70% with baseline 60% and target 80% yields 50% change progress. Financial percentage metrics retain their underlying currency context (for example, USD operating margin); that context must match even though amounts are displayed as percentages. Percentage gaps are described in percentage points, not currency amounts or relative percentage changes. There is no currency conversion.

Only an active goal with a validated, comparable actual outside its target generates a concern. It describes the measured gap and directs the user to investigate source records. It does not predict a missed deadline, explain an unsupported cause or assign a speculative risk score. `deadlinePassed` is a company-timezone date comparison only. Attainment refers to the confirmed reporting period; it does not establish that a target was reached before its deadline.

**Active / Paused / Archived** are administrator-managed lifecycle states, separate from **Target met / Below target / Above target / Within threshold / Outside threshold / Unassessed**. Pausing or archiving suppresses active concerns without fabricating achievement. Status-only changes retain the original source binding and protection envelope; they do not silently reconfirm a changed source. An administrator can archive a goal whose source has been removed.

## Shared service and persistence

`createGoalService` consumes the existing intelligence service's trusted `withAuthorizedState` callback. The callback now also supplies current company configuration, company version and timezone from the same coherent authorized read. These raw values stay server-side. There is no second metric calculator, source cache or evidence store.

Definitions persist in optional `company.data.governedGoals`, validated by a strict schema. Each stores its definition, version, timestamps, confirmed entity/namespace binding and original category/sensitivity/department protection envelope. No actual, progress or attainment is stored as source truth; every read reassesses the current authorized semantic metric.

Writes use the existing server-only `company_update` RPC, its company lock, Owner/Admin check and company-version compare-and-swap. A record version also guards concurrent goal edits. Stable UUIDs and canonical definition comparison make identical create retries idempotent, including when a response is lost. Up to 100 governed goals are supported per company. Other company data is preserved; a stale company/goal version returns 409 rather than overwriting another edit.

A goal write changes configuration, not source records. Current source state is revalidated on the next read, so a concurrent source change cannot persist a fabricated measurement. Goal configuration changes also change the shared dataset proof through the existing company version; old citations must be refreshed. No new SQL table, migration, browser database access or write permission is introduced.

### Interfaces

- `GET /api/companies/:company/intelligence/goals` accepts the existing reporting context. Returns `version`, `companyId`, `companyVersion`, `authorization`, `datasetRevision`, `context`, and authorized `items` only. Each item separates its definition, actual, assessment, change progress/explanation, validation reason/next action, deadline flag, supported concern, metric definition/state, source period and revision-bound evidence URL.
- `POST /api/companies/:company/intelligence/goals` accepts strict definition fields: `id`, `version`, `companyVersion`, `title`, `level`, `department`, `scope`, `metricId`, `target`, `unit`, `currency`, `period`, `deadline`, `owner`, `direction`, `threshold`, `baseline`, `lifecycle`. Returns `{id, version, companyVersion}`. Unknown fields and unsupported metric/unit/period types are rejected. Only Owner/Admin can write. A target can be configured for a different valid currency/period, but remains unassessed until a validated metric matches exactly.
- Source investigation uses the existing shared `/intelligence/evidence` endpoint. It reauthorizes record/column access and checks the dataset revision. If a current source metric is validated but incompatible with a goal, its evidence is available with an explicit warning that it does **not** establish goal progress.

Goal input periods use either `{kind: "snapshot", asOf: "YYYY-MM-DD"}` or `{kind: "interval", start: "YYYY-MM-DD", endExclusive: "YYYY-MM-DD"}`. Dates must be valid calendar dates, not merely match a pattern. The form labels the interval end as exclusive. Deadline is independent metadata, not an implicit reporting-period conversion.

## Permissions and context

The shared protected-fact policy, previously used for saved Actions, is reused for Goals. `canReadAction` remains a compatibility alias; Actions behavior is preserved. A scoped reader needs both current worksheet/category/sensitivity/department access and the goal's original protection requirements. Executives do not automatically receive financial/payroll access. Restricted goals do not contribute titles, owners, target values, concerns or counts to the response. Owner/Admin can inspect an orphaned goal; other roles cannot bypass current source authorization. Existing worksheet/column evidence allowlists remain authoritative.

Company, department, source scope, reporting period, search, lifecycle filter and repeated tags survive business navigation. Evidence and Data Connections return to the originating goal through the existing same-company allowlisted navigation helpers. URL periods are preserved context, not instructions to recompute unrelated calendar totals. Scope/department select authorized goals; search/lifecycle filter the visible list.

The browser reuses the shared authorized report proof. Goal views are component memory keyed by company authority, source revision and reporting context, with response metadata checked against that proof before display. There is no browser-local intelligence persistence. Same-context refresh retains existing visible goals; changed authority/revision or failed reads do not keep potentially unauthorized target data. Failed writes retain the draft, loading never asserts an empty result prematurely, and one clear goal-read retry is available. Empty, partial/unassessed, unavailable-goal, source-review, write-conflict and read-error states are explicit.

## Verification and limitations

Automated rule cases cover increase/reduce/threshold directions, missing baselines, negative/above-100% progress, valid zeros, reducing to zero, incompatible scopes/units/currencies/periods, stale/unconfirmed/missing metrics, identity/department changes, percentage-point gaps, financial margin currency context, historical deadlines, numeric precision and invalid contracts.

The real application/database integration verifies persistent definitions across restart, idempotent creation, version conflicts, exact shared-metric/evidence parity, company/department goals, incompatible periods/currencies, Owner/Admin-only writes, Viewer/Manager/Executive isolation, financial sensitivity restrictions, tenant isolation, stale/removed sources and safe status changes for orphaned goals.

Browser acceptance covers company/department creation, increase/reduce/threshold goals, persistent edits, pause/resume, actual/progress separation, mismatched-period guidance/recovery, source evidence and returning navigation, retained refresh, read retry, empty states, and 390/768/1440px interaction/overflow checks. Mobile mapping/edit dialogs are captured at their top and reachable footer controls.

MVP limitations:

- One existing semantic metric scope per goal; no implicit company rollups, mixed currencies or automatic period conversion. The supported metrics remain the existing ten governed definitions.
- Future/different-period targets are unassessed until matching validated data exists. Fixed snapshot goals do not become rolling-date targets automatically.
- Baselines and owner labels are administrator-entered configuration. No automatic historical baseline verification, directory assignment, notifications or inferred employee identity/workload.
- Threshold checks apply to the confirmed period/snapshot; continuous adherence is not proven. No historical deadline-attainment proof, forecast, AI-generated targets, speculative scoring or automatic Actions.
- Legacy onboarding/prototype definitions remain preserved in `company.data.goals` and existing setup flows. They are not automatically parsed/promoted into governed targets; users must explicitly define a compatible metric, unit and period in the new workflow. Existing local/prototype tracking is not treated as business evidence.
- No delete workflow, row-level source ACLs, archived source-row replay, or new permission-management UI. Existing worksheet/category/sensitivity/column policies apply.
- All acceptance datasets are synthetic and local. Production policies, real customer data and live Google connections were not changed.

Stop after 4D for approval before 4E.

## Recorded results

Final local verification: **104 automated tests passed**, **16 full serverless browser journeys passed**, **7 focused progress-rule tests passed**, and the real database/application integration passed, including a final scoped-Viewer/Admin acceptance rerun. Frontend TypeScript and the production-mode Vite build passed; its existing bundle-size warning remains. Design-system CSS remains `index-dH7GHMWQ.css`.

Screenshots, logs, verification examples and the full changed-file inventory: `/workspace/artifacts/milestone-4d/README.md`. Implementation commits: `3e10de9`, `edf8d64`. No deployment or production migration was performed. Stop here for 4D approval.
