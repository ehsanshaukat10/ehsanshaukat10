# Executive overview

Frontend-only dashboard, mounted in the existing company Overview route. Existing navigation, Helvetica Neue stack, colors, field components, company management and onboarding remain in place.

The default view uses actual browser-local workspace configuration and **no invented performance values**. The Data preview selector explicitly enables illustrative workbook scenarios: connected, partial department coverage, failed sync with cached records/retry, stale records, or no critical issues. Scenarios reset to Your workspace on reload or company change. No live integration, Google connection, AI service, notification or external assignment is performed.

Automatic business lenses use industry, operating model, priorities, goals and departments. Services emphasize delivery/utilization/receivables; SaaS emphasizes retention/churn/customer growth; managed IT emphasizes SLAs/tickets/renewals. Only department-relevant measures are offered. Existing frontend role scopes are respected; this is presentation logic, not server authorization.

Customize provides predefined layouts, up to three pinned measures, department visibility, secondary section visibility/order, reporting currency and period. The situation summary, critical priorities, data quality and primary performance section cannot be hidden. Layout and local decision notes persist per browser user/company. Selecting a reporting currency changes illustrative units; it does not convert exchange rates.

Monthly example totals are split into four periods; their sum reconciles exactly. The other reporting views show the last three or twelve complete months, with revenue compared to the preceding equivalent period. Revenue, expenses, margin and milestone totals follow that selection. Receivables, resource capacity, customer/SLA counts and renewals are illustrative snapshots at the reporting cutoff, with calculation details in their drilldowns. Dates follow the current clock; stale examples shift the cutoff back twelve days. Missing department coverage remains unavailable rather than zero. Goal bars are illustrative actual-versus-target previews, not forecasts or assertions of attainment by the goal deadline; mismatched measures remain unavailable.

Chart points support focus, hover, selection, comparative bars, expense categories and an accessible data table. Department, client, project, goal and risk details retain source/period context. Ask Aynor uses selected context in a clearly labeled local simulated explanation. Decisions can be recorded locally without hiding unresolved alerts. Optional dependencies, deadline strip, utilization segments, concentration bars and activity dots each have a specific analytical purpose.

## Verification

From source/ with Vite running at port 5174:

```sh
npm run build
PROTOTYPE_URL=http://127.0.0.1:5174 npm run test:frontend
node src/tests/dashboard-model.mjs
PROTOTYPE_URL=http://127.0.0.1:5174 node src/tests/dashboard.browser.mjs
```

The model checks period arithmetic, coverage, company lenses and role-appropriate metrics. Browser checks cover honest missing data, chart keyboard interactions and expenses, contextual analysis, local decisions, saved company preferences, partial/stale/failure/retry states, protected core sections, three/ten departments, no goals, company isolation, restricted viewers and responsive overflow. Tests assert zero backend requests.

Later integration needs authenticated validated records, server-enforced scopes, sync timestamps, stable reporting calendars, unit/goal-period reconciliation, source provenance, contextual analysis and storage of per-user layout/decisions. None of those backend changes are implemented here.
