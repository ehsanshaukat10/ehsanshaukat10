# Stabilization Sprint A — data and workflow integrity

Scope: onboarding goal continuity, department removal integrity, persisted mapped-field counts. No deployment, production migration, design-token changes, or Sprint B work.

## Root causes and behavior

### Onboarding goals

The onboarding wizard persisted descriptive goals in `company.data.goals`, while the governed Goals module read only `governedGoals`. These are different contracts: descriptive targets such as “20% growth” do not identify a validated metric, baseline, currency, or period.

- Save goal now persists immediately in server mode; failed writes keep the form and show the existing error state.
- Owner/Admin can review and edit saved onboarding definitions in Goals, retaining ID, title, description, raw target, KPI wording, deadline, and owner label.
- Explicit metric confirmation uses the existing governed goal form. It retains the same ID and original definition and atomically removes the descriptive record. Exact retries do not duplicate it.
- Governed edits refresh company state so returning to setup sees the saved definition. Setup/review shows confirmed goals without offering an incompatible legacy editor.
- Unbound descriptive goals have no permission/category binding, so they are visible only to Owner/Admin in an unfiltered company context. No fabricated progress or inferred ownership identities.
- Same-title goals with different IDs remain distinct. Existing same-ID collisions render the canonical governed record once; read operations do not destroy conflicting historical definitions.

### Department removal

Configuration validation checked legacy `data.mappings`, while actual assignments lived in the persisted source catalog. Removing a department could leave the catalog referring to an absent department.

- Removal is blocked while source parent/tab/config mappings, legacy table assignments, active/paused goals, member scopes, or unexpired pending invitation scopes still reference the department.
- Resolve assignments explicitly in existing Data Connections, Goals, or Team workflows, then retry. Source data and relationship contracts are not silently deleted or reassigned.
- Database guards share the company-row serialization boundary used by existing publication/update RPCs. A late source write cannot introduce a newly invalid department.
- Pre-existing orphan assignments remain accessible and are flagged in Data Connections for explicit reassignment. No destructive backfill.
- Confirmed relationships bind stable worksheet scopes/identifiers. Reassignment retains those contracts, identities, and source records; it does not invent new relationships.

The SQL migration is a **review artifact**, applied only in isolated local test databases. Production application is not authorized. Without the schema marker, department removal fails closed with an understandable error; other configuration saves continue normally. The migration must be approved and applied before a future deployment relies on these guards.

### Mapping counts

Settings counted `company.data.mappings`, which did not reflect current source-catalog mapping edits.

- Source summaries expose `mappedFieldCount` from persisted retained table headers (or saved legacy bindings).
- Counts are per worksheet, exclude ignored columns, and are grouped by saved department. The same column name on two worksheets counts twice.
- A retained saved mapping still counts if a later sync fails or the page is skipped; this is a mapping-state count, not a validated KPI count.
- Settings loads authorized source summaries and refreshes after version changes/focus. Loading and failed retrieval are never labeled zero; a single retry action recovers failed count retrieval.

## Changed files

Application root: `aynor-onboarding-frontend/source/`.

- `server/onboarding-goal.mjs`: shared original-definition contract.
- `server/contracts.mjs`: onboarding uniqueness validation.
- `server/goal-definition.mjs`: preserve description and original onboarding metadata.
- `server/goal-service.mjs`: authorized original-goal review/edit and atomic handoff.
- `server/sheets.mjs`: original-definition edit endpoint.
- `server/application.mjs`: preserve governed goals for old configuration clients and require removal guard schema.
- `server/source-catalog.mjs`: persisted field counts and orphan-assignment diagnostics.
- `src/features/live/goal-types.ts`, `GovernedGoals.tsx`: existing goal views/forms handle original definitions and explicit metric confirmation.
- `src/features/onboarding/SevenStepOnboarding.tsx`: immediate persistence and confirmed-goal continuity.
- `src/features/live/SourceWorkspace.tsx`: existing error component flags orphan assignments.
- `src/features/intelligence/Settings.tsx`: authorized persisted counts/loading/error/retry.
- `supabase/migrations/202611030001_workflow_integrity.sql`: review-only transactional guards.
- `tests/onboarding-goals.test.js`, `tests/sprint-a-integrity.test.js`, `tests/sprint-a.browser.mjs`: focused regressions.
- `tests/fixtures/serverless-database.mjs`, `scripts/test-serverless.mjs`: isolated migration/test integration.

## Acceptance evidence

The SQL-backed tests exercise fresh/existing companies, save/edit/reload, optimistic conflicts, same-ID handoff/retry, exact metric parity, ownership preservation, ignored-field counts, tenant isolation, restricted roles, worksheet/relationship references, active-goal protection, explicit reassignment, archived goals, member access, late source writes, and repair of pre-existing orphan assignments.

The browser journey exercises actual controls, failed edit/retry, explicit confirmation, returning setup navigation, count loading/error/retry, blocked department removals, explicit resolution, reload persistence, another company, and 390/768/1440px overflow checks. Synthetic ledger: revenue 100 + 200 = 300; target 500, baseline 100 gives 50% change progress. Four retained columns from five source columns, with Notes ignored.

Screenshots and final test results are recorded in `results.md` alongside this report.

## Remaining limitations / regression risks

- No production database, real Google account, or live AI provider was used. OAuth/email/providers remain controlled fixtures in browser regressions.
- Original owner values remain administrator-entered labels; no user identity is inferred.
- Descriptive goals require explicit metric confirmation before scoped roles can see calculated progress.
- Archived goals retain historical department/scope definitions and may become unassessed after deliberate source reassignment; history is preserved.
- Pre-existing orphans need explicit administrator repair. Unknown same-title goals are not automatically merged.
- These tests simulate stale publications and version conflicts; they are not a production concurrency/load test.
- The database migration and future deployment require separate approval. No production migration/deployment occurred.
