# Governed executive reporting — Milestone 3

## Scope and design lock

The existing Overview route now reads the executive-only projection of `sources/intelligence` (without worksheet samples) and renders only validated semantic metrics. It no longer imports the raw BusinessOverview/OperationalOverview presentation or fetches `sheets/overview` for executive calculations. The original reporting endpoint remains available to Data Connections and existing import consumers.

No stylesheet, design token, global component, header/sidebar implementation or navigation entry changes are part of this milestone. Overview uses existing Panel, KPI card, Button, Select, chart and table classes. Data Connections uses the existing Modal and mapping/form components. Query parameters provide scope selection and an investigation detail view under the existing Overview route, not a second dashboard or sidebar destination.

## Executive content

`server/executive-presentation.mjs` selects among validated results. Lexicographic precedence is explicit: recognized enabled configured KPI names/IDs, ordered company priorities, operating-model relevance, then stable reporting name/identifier. These rules select content; they never manufacture a calculation or an AI priority score. Custom names that do not match a supported definition do not create new metrics.

Every table retains its own reporting scope. Currencies, entity namespaces and reporting periods are never implicitly combined. Users can choose a scope; other validated reports remain available in Additional business reporting. Scope labels are confirmed business reporting names, not a list of workbook tabs.

- Primary strip: at most four measures, and at most two related financial measures. Defaults emphasize revenue/profit; expenses and margin sit together in financial performance. Explicit configured metrics are prioritized, including margin-only reporting.
- Financial performance: revenue/expense series derive only from their validated source rows and currency minor units. Date positioning uses actual calendar distance. Trend/Compare controls do not invent a prior-period comparison, growth rate or forecast.
- Sales: won value and won-deal count remain separate from recognized revenue. They are not plotted on a shared monetary/count axis.
- Delivery: confirmed active/overdue counts, with comparisons rather than a composition that incorrectly adds overlapping groups.
- Capacity: planned utilization from confirmed hours, clearly distinguished from actual utilization.
- Needs attention: positive overdue balances/project counts, negative operating profit, or planned utilization above 100%. Each issue carries its own source scope and period. No global financial impact is summed across currencies or unrelated records, and no root cause is claimed.
- A concise supported-issue summary appears only when there are issues. No unsupported “business is healthy” conclusion is generated from missing data.

Only validated values appear as current performance. Missing/unconfirmed inputs show a concise correction action; stale sources route to Data Connections for refresh. Instructional, unknown, excluded and unsupported data is not promoted to executive metrics. Deliberate reporting exclusions retain their source data without creating a false missing-mapping warning.

## Confirmation experience

Each mapped page in Data Connections has a Business meanings action. Overview's review action can deep-link directly into the relevant page's confirmation dialog.

The dialog offers business purpose, reporting name, compatible column bindings, currency, reporting dates and explicit status meanings. It uses source types to limit incompatible selections. Proposals remain editable and must be affirmed before confirmation. Users can choose whether the report is included in Overview. Missing meanings remain unavailable; they do not become zero. A save that still has no usable supported measures explains the validation reasons rather than claiming the dashboard is ready.

Date-based financial summaries may explicitly confirm one financial record per reporting date. This uses the existing unique date as the record identity; it never generates row IDs. Duplicate dates remain blocked. This option is restricted to finance and does not declare that projects, invoices or resources are uniquely identified by dates.

The API still uses exclusive interval ends. The UI accepts an inclusive end date and converts it exactly (31 October becomes an exclusive 1 November). Snapshot dates follow the actual company's stored profile timezone. Confirmations, exclusions and labels persist through normal syncs.

## Investigation and source records

Business issues open a focused evidence detail view under Overview. It evaluates the metric and contributing records from one saved snapshot, so a concurrent refresh cannot mismatch them. It shows the metric definition, reporting period, department when assigned, source lineage and only contributing records. Back returns to the reporting scope that originated the investigation.

`GET /api/companies/:company/sources/:source/evidence?tabId=...&metricId=...` revalidates evidence server-side. Unvalidated/stale results return 409. Wrong-company sources return 404; non-admin and unauthenticated callers remain denied. The UI cannot select arbitrary source rows or join identifiers by similar text.

Worksheet lists, raw records, import statistics and data-quality reports are available in Data Connections through Explore imported records (`?records=1`). Existing column mapping, source management, uploads, Google connections and manual sync remain unchanged.

## Loading, recovery and access

Overview keeps tab-local cached semantic results through navigation, reload and background requests. Cache keys include identity, company, role and an executive-schema marker, so old raw overview caches cannot reappear as governed KPIs. Failed refreshes explicitly identify displayed values as the last saved report. Access-denied responses clear the cached report. Logout/session cleanup retains the existing cache-clear behavior.

Initial loads use the approved skeleton; retry is available after failed loads. New source results replace old values when validation reports stale/insufficient data rather than retaining them as current. Confirmation dialogs retain entered values on save errors and protect against closing during a save.

## Verification

- 74 automated tests pass, including semantic registry, SQL persistence, confirmation, duplicate IDs, mixed currencies, dates, company-local timezone, configured metric selection, intentionally excluded reporting, insufficient-data states and evidence permission checks.
- All 11 browser journeys pass. Existing journeys now explicitly confirm financial semantics before expecting executive values; production does not silently confirm anything. Record exploration assertions exercise Data Connections instead of Overview.
- The added executive browser journey tests source-backed finance (30,000 revenue, 11,000 expenses, 19,000 profit), delivery (2 active / 1 overdue with exactly its supporting project), custom-label sales (5,000 EUR won value, not revenue), and resource capacity (112.5% planned utilization), plus responsive layouts.
- Production TypeScript/Vite build passes.
- Before/after screenshots are captured with controlled synthetic data. CSS/global workspace diffs are empty.

## Unsupported behavior and boundaries

- No implicit company-wide aggregation across tables, even if currencies or labels match. No FX conversion or inferred entity joins.
- Evidence detail currently previews the first 100 contributing records and reports the total. Full imported records remain searchable in Data Connections.
- No GAAP/IFRS recognition rules, MRR/ARR, actual timesheet utilization, forecasts, causal diagnosis, or arbitrary custom KPI formulas.
- Unknown company priority terminology has no guessed interpretation; supported configured metrics and confirmed scope selection remain usable.
- Undated changed snapshots still require reporting-scope reconfirmation. Source records and saved field meanings are retained.
- Legacy financial-only snapshots without a normalized table need column mapping before semantic reporting. Their source access remains available.
- Cross-module Department/Goal/Action/Dependency/Ask integration is Milestone 4 and has not been implemented. No goal progress or business AI conclusion is fabricated to fill that gap.
