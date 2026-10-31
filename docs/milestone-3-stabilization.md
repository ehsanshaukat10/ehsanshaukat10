# Milestone 3 — focused UX stabilization

Completed the five approved defects and clarified the existing capacity concern. No redesign, design-token changes, calculation changes, schema migration, or Milestone 4 work.

## Changes

- Mapping actions follow the complete form in normal document flow instead of sticking over fields. Existing padding, borders, buttons and typography remain unchanged.
- Same-company Overview return links preserve the complete reporting query, including scope, period, repeated filters and fragment. Sidebar links, Data status, mapping corrections, records, Open dashboard, evidence and Back links carry the context. Return destinations reject external URLs and other companies. Scope selection updates the scope parameter without dropping other filters.
- Client, project, owner and person names are optional, explicit semantic bindings to validated text columns. Existing confirmations are not auto-expanded. Evidence reads these names from the same contributing source rows as the metric; no identity inference or joins. Missing values remain missing. The evidence region is keyboard-focusable for contained table scrolling.
- Dashboard metric bars allow actual formatted amounts to size/wrap within the existing grid, fixing the mobile currency clipping without hiding page overflow.
- Both cold-load and cached-load failures expose one Retry report action. Cached reports remain visible during refresh errors.
- Validated planned utilization strictly above 100% is labelled **Planned capacity exceeded**, with a statement that assigned hours exceed available capacity. The existing threshold and calculations are unchanged; no severity score was added.

## Regression verification

- `npm test`: **78 passed, 0 failed**.
- `npm run test:serverless`: **12 browser journeys passed**, including the new stabilization regression and existing account, onboarding, Google, upload, mapping and executive-reporting flows.
- Production-mode frontend typecheck/build passed. Existing Vite >500kB bundle warning remains.
- Additional final focused checks verify persisted name confirmations across a cold application instance and that stale 125% utilization does not become a validated concern.
- Browser layout checks cover **320, 390, 768 and 1440px**. Mapping geometry checks ensure actions remain below the last input; dashboard measurements ensure the document does not overflow and metric amounts fit.
- Browser checks retain company/scope/period/repeated filters through connection sections, records, Back, reload, evidence and return. The test waits for the executive response rather than accepting the briefly displayed cached scope.
- Evidence tests check exact contributing project rows, confirmed client/project/owner names, missing-owner placeholders, exclusion of future projects, unchanged values/row lineage, rejection of numeric name columns, and persistence. Existing access-isolation checks remain in force.
- Cold and cached server failures are checked at desktop/mobile widths for exactly one recovery action and successful retry.

## Review artifacts

Before/after screenshots and test logs are delivered in `/workspace/artifacts/milestone-3-stabilization/`. Before screenshots were captured from an isolated `12cdbe9` build with the same synthetic source records. After screenshots use the updated build. These are local application/provider-fixture checks, not live customer account or external-provider availability tests.

## Changed files

Frontend:

- `src/features/live/dashboard-navigation.ts` — safe, context-preserving links.
- `src/features/live/LiveOverview.tsx` — retain query parameters and one recovery action.
- `src/features/live/GovernedOverview.tsx` — preserve correction/evidence links and explain capacity concern.
- `src/features/live/BusinessEvidence.tsx` — contextual return and accessible evidence scrolling.
- `src/features/live/SourceWorkspace.tsx` — preserve return context across source subviews and Open dashboard.
- `src/features/live/SemanticReview.tsx` — optional explicit evidence-name confirmations.
- `src/features/live/source-workspace.css` — remove sticky action overlap.
- `src/features/live/operational-overview.css` — constrain metric bar layout to available width.
- `src/features/intelligence/Settings.tsx` — safe contextual Back destination.
- `src/features/workspace/Workspace.tsx` — carry context on Data Connections navigation; no shell styling changed.

These frontend paths are under `aynor-onboarding-frontend/source/`.

Backend, under `aynor-onboarding-frontend/source/server/`:

- `semantic-intelligence.mjs` — optional confirmed text-name roles; metric definitions unchanged.
- `source-catalog.mjs` — evidence context from confirmed text fields on contributing rows.
- `executive-presentation.mjs` — capacity concern wording only.

Regression/support files:

- `tests/dashboard-navigation.test.js`
- `tests/ux-stabilization.browser.mjs`
- `tests/semantic-catalog.test.js`
- `tests/executive-presentation.test.js`
- `tests/executive-dashboard.browser.mjs`
- `scripts/test-serverless.mjs`
- `docs/milestone-3-stabilization.md`

## Remaining limitations

- Existing name meanings must be confirmed once before names appear; missing identities are never invented.
- Wide evidence tables retain their existing contained horizontal scrolling. It does not widen the page; keyboard users can focus the region. Both edges are captured in the mobile screenshots.
- Preserving URL filters does not introduce new filtering semantics. The confirmed semantic reporting period still governs each metric.
- Live Google reauthorization across an external provider redirect was not newly re-certified; the existing controlled Google journey passed.
- No deployment was performed. Other acceptance-review suggestions (for example broader KPI drill-downs or changing the single-value chart) remain outside this approved stabilization scope.

Stopped for final Milestone 3 approval.
