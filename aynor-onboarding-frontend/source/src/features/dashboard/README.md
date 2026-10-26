# Executive overview

Frontend-only refinement of the existing company Overview route. Branding, Helvetica Neue typography, colors, card surfaces and onboarding routes are preserved. No backend, authentication configuration or external integration changes.

## Default interface

The page contains one Overview heading, a concise intelligence line when meaningful, reporting period and Customize. A single discreet Demo indicator identifies illustrative records. No scenario selector, shortcut-chip row, repeated company/industry, duplicate timestamps or floating debug controls appears in company views. Developer tools remain available on the explicit /prototype gallery route.

Three relevant pinned measures lead into the existing interactive chart and at most three priorities. Metric contexts are compact; calculation, source and action evidence remain in drilldowns. Critical coverage/freshness/sync warnings appear only when relevant. The default optional sections are departments, goals, dependencies and deadlines. Client concentration and activity remain available through Customize; they are not default widgets.

Primary navigation: Overview, Departments, Dependencies, Goals, Actions, Ask Aynor. Company settings and team permissions form a separate navigation landmark. Existing section hashes and company routes still resolve. Ask Aynor opens contextual local analysis and can be reopened after closing.

Departments display a compact matrix: department, key measure, change and status. Finance expense change compares the last two chart intervals; SaaS accounts show the defined customer-growth snapshot. Capacity variance is identified in details. Missing measures/trends remain unavailable rather than fabricated. Configured departments and goals are never supplemented merely to fill the layout.

Goals show the two nearest active deadlines and actual-versus-target values, with details on click; arbitrary percentage labels are removed. They are illustrative previews, not forecasts of attainment by the deadline. Dependencies explain the existing shared-specialist delivery risk before exposing the connected client, project and resource. Deadlines retain their compact timeline and statuses.

## Data and interaction boundaries

Financial and operational measures adapt to business model, actual departments and frontend role scopes. The default view uses clearly labeled illustrative records, not live company performance. Existing scenario states remain testable through the overview query parameter `state=workspace|connected|partial|sync-error|stale|clear`, including within the standalone hash route. No scenario selector is exposed in the normal UI.

Layout preferences, selected currency/period and local decision notes persist per browser user/company. Reporting currency changes illustrative units, not exchange rates. Monthly intervals reconcile to the last complete month; other views use the last three/twelve complete months. Revenue, expenses, margin and milestone totals follow the period. Customer, SLA, capacity, overdue invoice and renewal measures are cutoff snapshots. Source freshness and goal-period reconciliation must be validated during future integration.

Chart hover/focus updates exact readings; selection opens expense breakdowns and contextual investigation. KPI, risk, department, goal, client and dependency controls retain meaningful details. Ask Aynor is explicitly simulated locally; decisions send no assignments or notifications. Reduced motion disables animations and smooth scrolling.

## Verification

From source/, with Vite running on port 5174:

```sh
npm run build
PROTOTYPE_URL=http://127.0.0.1:5174 npm run test:frontend
node src/tests/dashboard-model.mjs
PROTOTYPE_URL=http://127.0.0.1:5174 node src/tests/dashboard.browser.mjs
```

Browser checks cover the six main destinations, separate settings, absent debug/scenario controls, a single Demo indicator, optional widgets off by default, matrix drilldowns, chart pointer/keyboard interaction, contextual questions, local decisions, preference persistence, partial/stale/sync-failure/retry states, protected alerts, three/ten departments, no active goals, company isolation and restricted scopes. Responsive checks assert no horizontal overflow. Tests assert zero backend requests.

Future backend work remains separate: validated records and provenance, server-enforced scopes, stable reporting calendars, source sync timestamps, goal-unit/period reconciliation, contextual analysis and durable per-user preferences. None is implemented here.

## Comparison and navigation refinement

The default performance view compares revenue and operating costs in grouped bars. Trend displays both series on the same zero-based axis; no truncated scales are used to amplify small changes. Five labeled intervals select a sensible upper bound from actual plotted values. Currency units, exact selected-period values, per-mark tooltips and the data table remain available. Click or keyboard-select a period for expense categories and contextual questions. Revenue/cost totals and margin distinguish the full reporting period from the selected interval. No historical sparkline is invented for cutoff-only KPIs.

Delivery status uses a compact stacked bar calculated from the displayed project records; each segment opens its matching projects, deadlines and evidence. Risk severity, impact and recommended action receive separate visual treatments. Existing optional concentration/activity modules remain optional.

The compact header offers workspace search and Ask Aynor (Ctrl/Cmd+K). Search uses configured companies, destinations, departments and goals, and can pass a question into the existing local assistant. Notifications derive only from incomplete setup and unconfirmed mappings; no external messages or invented performance alerts are supplied. Account identity stays in the sidebar, with role and local plan combined into one compact secondary line. Plan changes remain explicitly simulated, without billing or external services.

## Skipped onboarding recovery

New workspaces without validated records show unavailable performance values, not the illustrative dataset. The populated demo remains available for explicitly configured example workspaces; skipping goals/priorities does not discard their configured example data. Skipping data connection or mapping produces an honest data-empty state. The header's Demo badge follows the same eligibility rule.

Overview offers only outstanding setup actions for departments, source connection, field mapping, priorities and goals. Each action opens the existing onboarding step with `return=overview`; saving returns directly to the dashboard and removes the completed prompt. The original seven-step and review-edit journeys retain their navigation. Empty chart, department, goal and relevant operational sections use restrained icons and specific setup links. Unknown metrics stay as dashes and link to source setup; existing configuration remains visible. Read-only roles receive administrator guidance rather than edit actions.

Check the full real journey: `PROTOTYPE_URL=http://127.0.0.1:5175 node src/tests/onboarding-empty.browser.mjs` (use the running preview's port). It creates a workspace, skips optional setup, completes onboarding, verifies empty Overview and refresh behavior, adds a department through a recovery action, saves back to Overview, and checks responsive layout and zero backend requests.
