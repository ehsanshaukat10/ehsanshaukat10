# Sprint A — acceptance results

## Result

All three authorized defects have local implementation and regression coverage. No production migration or deployment was performed. Sprint B has not begun.

| Check | Result |
|---|---|
| `npm test` | 131 passed; 0 failed, skipped, or cancelled |
| TypeScript, frontend project | Passed (`tsc --noEmit`) |
| Vercel-mode production build | Passed; pre-existing large-bundle advisory remains |
| Existing serverless browser journeys | All 18 existing journeys passed, including accounts, onboarding, ingestion/mapping, Overview, permissions, Departments/Actions, Dependencies, Goals, controlled Ask, and session/sync behavior |
| New Sprint A browser journey | Passed separately against the same local serverless fixture; desktop, tablet and mobile |
| Design system | No CSS/design-token files changed; generated CSS remains `index-dH7GHMWQ.css` |
| Whitespace validation | `git diff --check` passed |

The initial combined browser run stopped in the newly added regression because the test toggled an already-retained department-removal draft back on. The test now inspects selection state before removing it, preserving the application's existing draft behavior. The corrected Sprint A journey passed. Existing journeys were not reported as a fresh successful combined command after that test-only correction.

Provider tests use controlled fixtures. No real-model AI acceptance, production data validation, real OAuth, real email delivery, or production migration is claimed.

## Screenshot evidence

Artifacts: `/workspace/artifacts/stabilization-sprint-a/`. Before evidence was captured during the accepted product audit; after evidence uses a fresh synthetic Sprint A company, so these demonstrate the behavior, not an identical production record.

| Defect/state | Before | After |
|---|---|---|
| Onboarding goal invisible in Goals | [Before](/workspace/artifacts/stabilization-sprint-a/before/onboarding-goal-missing-in-module.png) | [Saved definition visible](/workspace/artifacts/stabilization-sprint-a/after/onboarding-goal-visible.png) |
| Original target and ownership | See audit before above | [Explicit confirmation](/workspace/artifacts/stabilization-sprint-a/after/explicit-goal-confirmation.png), [same-ID governed result](/workspace/artifacts/stabilization-sprint-a/after/confirmed-goal-same-id.png) |
| Conflicting goal edit | — | [Version conflict, retained form](/workspace/artifacts/stabilization-sprint-a/after/goal-edit-conflict.png) |
| Department removed while still assigned | [Before](/workspace/artifacts/stabilization-sprint-a/before/removed-department-still-reported.png) | [Assignment blocks removal](/workspace/artifacts/stabilization-sprint-a/after/department-removal-blocked.png), [active goal blocks removal](/workspace/artifacts/stabilization-sprint-a/after/active-goal-removal-blocked.png) |
| Safe explicit resolution | — | [Records retained, removal completed](/workspace/artifacts/stabilization-sprint-a/after/department-resolved-safely.png) |
| Incorrect mapped-field count | [Before](/workspace/artifacts/stabilization-sprint-a/before/settings-mapped-count.png) | [Four saved fields](/workspace/artifacts/stabilization-sprint-a/after/accurate-field-count.png) |
| Count retrieval fails | — | [Unavailable, not false zero](/workspace/artifacts/stabilization-sprint-a/after/mapping-count-error.png) |
| Mobile states | — | [Goal definition](/workspace/artifacts/stabilization-sprint-a/after/onboarding-goal-visible-mobile.png), [confirmation](/workspace/artifacts/stabilization-sprint-a/after/explicit-goal-confirmation-mobile.png), [blocked removal](/workspace/artifacts/stabilization-sprint-a/after/department-removal-blocked-mobile.png), [resolved settings](/workspace/artifacts/stabilization-sprint-a/after/resolved-mobile.png) |

## Reviewable commits

- `71b4421`: original onboarding goal definitions and explicit governed handoff.
- `a04f145`: refresh company state after goal writes.
- `e1b4e4e`: transactional department safeguards, orphan recovery diagnostics, persisted count contract, SQL/API regressions.
- Subsequent commits contain the Settings count consumer, integrated browser regression and this acceptance report. See repository history.

See [implementation report](sprint-a.md) for changed files, root causes, exact behavior and limitations. Stop here for Sprint A review.
