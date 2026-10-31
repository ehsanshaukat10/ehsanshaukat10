# Semantic foundation — Milestone 2

Backend only. Existing views, CSS, import/mapping routes and legacy reporting outputs are unchanged. The semantic results are a new governed contract; Milestone 3 must explicitly adopt them. No dashboard is silently switched over and no claim is made that the current UI now uses these definitions.

## Persistent model

The existing company-scoped catalog snapshot holds `semanticSettings` and each imported tab's optional `semantic`. Existing SQL lease/publish operations save these fields atomically alongside, not instead of, import configuration and records. No database migration or new environment variable is required.

A confirmation stores semantic version, worksheet purpose, entity kind, stable entity namespace, field-to-column bindings, explicit currency, reporting period, status vocabularies, enabled flag, normalized schema, original data fingerprint, confirming actor and timestamp. Successful syncs and same-workbook replacements retain it. Original-cell currency and identifier evidence is refreshed independently, so retaining a confirmation never means ignoring new conflicting source evidence.

Supported purposes: finance, sales, delivery, resources, marketing, operations, other, reference. Deterministic proposals recognize the first four from compatible column signatures and populated table data; reference evidence uses instruction-like cell content. Names alone never establish purpose. Other purposes can be explicitly confirmed but have no MVP metrics. Proposals are not confirmations; unknown and reference data stay accessible in the source catalog and existing records views, but generate no executive metrics through this layer.

Company settings support custom column terminology (`fieldAliases`), enabled metric IDs, and a freshness threshold (1–8760 hours; default 48). Aliases change proposals, not existing confirmed meanings. There are no arbitrary formulas, uploaded code, workbook-specific rules or additional AI calls. Existing AI privacy and quotas are unchanged.

## API contract

All endpoints require an authenticated Owner/Admin membership for the requested company, matching existing source permissions. They do not expand department-manager or viewer access.

- `GET /api/companies/:company/sources/intelligence`: definitions, worksheet proposals/confirmations and calculated results for this company.
- `GET /api/companies/:company/sources/semantic-config`: current company semantic settings.
- `POST /api/companies/:company/sources/semantic-config`: replace settings after validation; omitted options revert to defaults. Example:

```json
{
  "fieldAliases": {
    "entity_id": ["Journal key"],
    "revenue": ["Recognized turnover"],
    "expense": ["Operating spend"]
  },
  "freshnessHours": 48,
  "enabledMetrics": [
    "finance.revenue",
    "finance.expenses",
    "finance.profit",
    "finance.margin"
  ]
}
```

- `GET /api/companies/:company/sources/:source/semantics`: source-filtered semantic view; nonexistent/other-company sources return 404.
- `POST /api/companies/:company/sources/:source/semantics`: confirm one imported tab. This adds business meaning; it does not edit cell values, ingestion types, existing financial mappings or department assignment. Source data must still match the imported snapshot, otherwise sync/reupload first (409).

```json
{
  "tabId": 0,
  "mapping": {
    "purpose": "finance",
    "entity": "transaction",
    "entityNamespace": "recognized-ledger",
    "fields": {
      "entity_id": "Journal key",
      "date": "Booked date",
      "revenue": "Recognized turnover",
      "expense": "Operating spend"
    },
    "currency": "USD",
    "period": {
      "kind": "interval",
      "start": "2026-10-01",
      "endExclusive": "2026-11-01"
    },
    "enabled": true
  }
}
```

`entityNamespace` is a company-local identifier domain, not a relationship inferred from similar labels. Entities: transaction, invoice, deal, project, resource, other. Binding `revenue` explicitly asserts recognized revenue, not arbitrary cash inflows; `expense` asserts operating expense. Ingestion's Money in/Money out mapping alone does not satisfy this confirmation.

Field roles: entity_id, date, revenue, expense, amount, outstanding_amount, status, due_date, assigned_hours, available_hours. A column can have one role. Numeric/date roles require compatible imported types; percentages cannot bind to monetary/hour roles. Entity identifiers must be nonempty, unique and safe; numeric IDs that lost leading zeros need text mapping. The source remains available for correction.

Status groups (`statusValues`) are explicit lists keyed by active, closed, won, lost. Local terminology is accepted; labels cannot overlap groups. Unknown source statuses prevent a confirmed metric. No shared Status vocabulary is imposed across unrelated business entities.

Reporting periods are explicit intervals with an exclusive end, or snapshots with `asOf`. Where a date field is bound, interval filtering uses that field. Without one, the confirmation asserts the entire table's reporting scope. Changed undated data requires reconfirming that scope, retaining the field mappings. Snapshot dates use company timezone and cannot silently roll forward with sync. Missing dates/amounts are never replaced by zero.

## MVP registry

| ID                          | Entity      | Required meanings beyond entity ID   | Unit / definition                                                                                 |
| --------------------------- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| finance.revenue             | transaction | date, revenue                        | Confirmed currency; recognized revenue sum                                                        |
| finance.expenses            | transaction | date, expense                        | Confirmed currency; operating expense sum                                                         |
| finance.profit              | transaction | date, revenue, expense               | Revenue minus operating expense                                                                   |
| finance.margin              | transaction | date, revenue, expense               | Profit / revenue × 100; zero denominator unavailable                                              |
| finance.overdue_receivables | invoice     | due_date, outstanding_amount, status | Active outstanding balances due before snapshot date                                              |
| sales.won_value             | deal        | date, amount, status                 | Won deal value in its currency; never presented as revenue                                        |
| sales.won_deals             | deal        | date, status                         | Unique won deal count in the interval                                                             |
| delivery.active_projects    | project     | status                               | Unique confirmed active projects at snapshot date                                                 |
| delivery.overdue_projects   | project     | status, due_date                     | Active projects past a confirmed deadline; no forecast                                            |
| resources.utilization       | resource    | assigned_hours, available_hours      | Planned allocated hours / available hours × 100 for one interval; not measured actual utilization |

Each result includes definition, aggregation rule, company and source/table scope, entity namespace, department, unit/currency, reporting period/timezone, validation state, confidence, required-field completeness, freshness policy, confirming mapping and source lineage. Lineage row positions refer to normalized snapshot indices, not original physical worksheet row numbers. Snapshot revision and field bindings identify the retained records supporting the result.

States: validated, provisional, insufficient_data, stale, unavailable. Only validated results have a numeric value. States and reasons are returned to future consumers rather than hidden by substituting zero. Source errors preserve original imported records while blocking current confirmed performance. Worksheet executive eligibility requires at least one validated metric.

Monetary sums use integer minor units for the explicitly confirmed currency; excess precision is rejected rather than rounded. Mixed/contradictory currency codes or original symbols block validation. Company currency never silently fills a missing metric currency. Different tables are never implicitly combined, even when names match. Shared entity namespaces with overlapping IDs require review rather than guessed deduplication. Unknown/reference/disabled/skipped tables cannot create business-entity conflicts in other validated tables.

## Deliberate limitations

- No automatic cross-table/workbook aggregation, joins, currency conversion or entity merging. Per-table results carry distinct source, period and entity scopes.
- One unique entity row per table. Repeated project/resource snapshots and invoice line items need a separate confirmed aggregation model in a later milestone; this MVP blocks duplicate identifiers.
- No GAAP/IFRS recognition engine, tax treatment, payroll accounting, inferred root causes or financial forecasts.
- No resource day/FTE conversions, utilization from actual timesheets, fiscal calendar or rolling period inference.
- A single table containing multiple currencies is withheld; it is not automatically partitioned.
- Pure legacy financial snapshots without normalized tables are not reinterpreted. Their existing reporting still works; semantic confirmation requires an imported table.
- No new UI controls. Existing Overview and intelligence modules remain on their current paths until Milestones 3/4 are approved. There are no new executive summaries, recommendations or AI business-analysis claims yet.

## Verification

`tests/semantic-intelligence.test.js` covers structurally different finance, invoice, deal, project, capacity and instructional tables; custom aliases; unknown columns; dates/timezones; currencies/precision; identifiers/duplicates; stale data; interval/snapshot scope; exclusion and independent table scopes.

`tests/semantic-catalog.test.js` exercises real SQL-backed HTTP handlers, persistent settings/confirmations after application restart, unchanged existing reports, upload replacement, published-source refresh and recalculation, contradictory currency changes, header drift, invalid-save preservation, company/source isolation, role denial and unauthenticated denial. Google/private connections still use the same catalog refresh helper; the existing customer browser journeys exercise private access and mapping.

Run the actual named unit tests with:

```sh
node --test --test-isolation=none --test-concurrency=1 --test-timeout=120000 tests/*.test.js
npm run test:serverless
```

No design files are changed in this milestone. Visual before/after screenshots are not applicable; the existing browser checks still cover responsive routes and retained loading states. These tests establish the bounded MVP behavior above, not arbitrary workbook understanding.
