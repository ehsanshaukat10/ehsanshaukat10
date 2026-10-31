# Milestone 4A — Shared Intelligence Service and Permissions

Implemented 4A only. Departments, Actions, Dependencies, Goals and Ask remain unchanged. No new AI, inferred relationships, forecast, ingestion behavior, semantic formula or design-system change. No deployment or production migration has been performed.

## Architecture and authority

`server/intelligence-service.mjs` is the shared server-side interface. It invokes the existing `evaluateSemantics` and `buildExecutiveReport`; it does not implement another metric calculator or mapping engine. `source-catalog.mjs` supplies the existing catalog normalization and delegates its legacy semantic/evidence reads to the service. Overview now uses the new business API through `useCompanyIntelligence`.

`aynor_intelligence_read` reads company configuration, current membership and the saved source snapshot in one SQL statement. Only the server database role can execute it. OAuth credentials are removed; company configuration and raw snapshots stay inside the trusted server. Browser database roles cannot call it. Existing source-management RPCs/routes remain Owner/Admin-only.

The full company snapshot is evaluated first so scoped readers cannot bypass existing overlapping-ID, currency or other validation failures. Authorization then projects the permitted worksheets, metrics, concerns and evidence before returning data. Non-admin evaluation results never include worksheet proposals, confirmations, unapproved headers or sample values. Public snapshots contain business results, not raw source catalogs.

## Permission model

- **Owner/Admin:** full company access; existing behavior retained.
- **Executive:** only explicitly granted business categories and sensitivity levels, across the company. The role alone grants no category or sensitive-record access.
- **Department Manager/Viewer:** the same explicit grants, additionally restricted to currently configured departments in their membership scope. Removed/stale department assignments do not grant access.
- Missing, malformed or absent policy denies non-admin access. New/unclassified worksheets do not become visible automatically.
- Evidence and source records additionally use the worksheet's explicit `recordColumns` allowlist. An allowed aggregate does not grant every underlying source column. Non-admin trend observations are withheld unless their date/revenue/expense columns are permitted.
- A finance-purpose worksheet always requires the `financial` sensitivity grant, even if its configured sensitivity is `standard`. `payroll` and `confidential` require their own grants and do not imply each other.
- Sensitivity classification is an explicit administrator declaration, not inferred from an Executive title or a spreadsheet name. Administrators must classify mixed sensitive worksheets at the most restrictive applicable level. This MVP does not automatically detect arbitrary payroll/PII content or provide row-level ACLs inside a worksheet.

### Policy configuration

Policy is an optional, validated `company.data.intelligenceAccess` object. Owner/Admin can save it using the existing version-checked company configuration PATCH. It is not returned in redacted non-admin company configuration. No new permission-management UI is added in 4A.

```json
{
  "version": 1,
  "worksheets": {
    "<source-id>:0": {
      "category": "finance",
      "sensitivity": "financial",
      "recordColumns": ["Transaction ID", "Date", "Revenue"]
    },
    "<source-id>:1": {
      "category": "resources",
      "sensitivity": "payroll",
      "recordColumns": ["Employee ID", "Assigned hours", "Available hours"]
    }
  },
  "grants": {
    "<member-user-uuid>": {
      "categories": ["finance"],
      "sensitivities": ["financial"]
    }
  }
}
```

Categories: `finance`, `sales`, `delivery`, `resources`, `operations`, `marketing`, `other`. Sensitivities: `standard`, `financial`, `payroll`, `confidential`. A worksheet category must match its confirmed semantic purpose. Category/sensitivity grants are per actor; record-column allowlists are per worksheet for non-admin business readers. This is not a per-user column-policy editor.

Use `PATCH /api/companies/:companyId` with `{version: currentVersion, data: {...currentData, intelligenceAccess: policy}}`. Preserve the other current configuration fields. Existing server and SQL Owner/Admin checks, optimistic version conflict handling and configuration audit remain in force. Non-admin intelligence endpoints are read-only and cannot modify policy.

## Shared API contract — version 1

All endpoints are under `/api/companies/:companyId/intelligence`. Authentication derives the actor from the session; query parameters cannot impersonate an actor or supply a role. Every request re-reads current membership. Responses use `Cache-Control: no-store`.

| Endpoint | Purpose |
|---|---|
| `GET /intelligence` | Authorized `metrics`, `concerns`, `scopes` plus the existing `executive` presentation |
| `GET /intelligence/context` | Current authorization/context/revision proof, without business values or records |
| `GET /intelligence/evidence` | A validated metric and its contributing records from one exact saved revision |
| `GET /intelligence/records` | Up to 100 authorized source records/columns for one scope; records are source data, not new calculated KPIs |
| `GET /intelligence/relationships` | Permission-checked reserved interface; returns no business relationships in 4A |

The in-process service exposes `context`, `evaluate`, `snapshot`, `evidence`, `records`, and `relationships`. `evaluate` supplies the existing semantic-view shape for adapters, with non-admin worksheet details redacted. `snapshot` is the shared public business DTO. Future modules should use this service rather than copying the engine or presenter rules.

### Snapshot response

```text
version, companyId, evaluatedAt
 datasetRevision
 authorization: {fingerprint, role, canManageSources}
 context: {key, scope, department, period, filters, periodBasis, filterBasis}
 metrics: governed semantic results (including unavailable/provisional states)
 concerns: exactly executive.issues, with the same reasons/metrics/evidence links
 scopes: exactly executive.scopes (validated reporting scopes)
 executive: existing Overview presentation
```

Each metric retains its existing ID, definition/aggregation, entity namespace, department, currency/unit, reporting period/timezone, state, value, completeness, confidence, freshness and source lineage. Values are not recalculated in the browser. Unvalidated metrics can have `period: null`; consumers must inspect validation state before displaying a business measure. Definition/service versions remain explicit through the versioned DTO and semantic engine. Source records are never silently converted into metrics.

### Reporting context

Supported context keys: `scope`, `department`, `period`, `filter`, `status`, `q`, `tag`. Repeated filters are retained; duplicate `scope`, `department` or `period` selectors are rejected. Unsupported keys fail with 400. Context keys are canonicalized, hashed, echoed and included in client cache isolation.

`scope` selects the reporting scope and `department` restricts available scopes. An unauthorized selector is denied rather than falling back to broader data. A scope incompatible with the selected department fails explicitly.

`period` and the other legacy navigation filters are retained context, **not a new arbitrary recalculation/filtering engine**. The response explicitly states this in `periodBasis`/`filterBasis`. Metric values retain their confirmed semantic periods and units, as before 4A. No implicit subperiod slicing, cross-currency aggregation or invented date basis is introduced.

### Revision-bound evidence

Evidence query:

```text
sourceId=<id>&tabId=<id>&metricId=<metric-id>&revision=<datasetRevision>
```

Source records query:

```text
scope=<source-id>:<tab-id>&revision=<datasetRevision>
```

Both can carry the same supported reporting context. `datasetRevision` is an opaque digest of snapshot/connection revisions, company configuration version and catalog content. It changes after source replacement, mapping/configuration/policy changes, even when row IDs or a numeric snapshot counter are reused.

The service reads once and evaluates the metric and its contributing rows against that one saved state. A missing or mismatched revision returns 409 and requires a fresh report. Row references are normalized snapshot positions, not physical spreadsheet row numbers. No historical-snapshot warehouse or row-position reconstruction is introduced.

Overview's issue links now include this revision. Evidence Back removes evidence-only revision/source/tab parameters and retains the originating company, scope, department, period and filters. Current source/evidence permissions are checked again on every read.

Legacy `/sources/intelligence` and `/sources/:id/evidence` remain admin-only compatibility adapters and use the same calculator/evidence service. A legacy admin evidence request without a token may read the current revision; the new shared evidence interface and Overview always require an explicit token. This compatibility exception is not available to new non-admin business consumers.

### Failure states

- 401: no authenticated session.
- 403: tenant membership/access/category/sensitivity/department/record-column denial.
- 404: unavailable scope for an administrator (no foreign source is resolved).
- 400: unsupported or conflicting context.
- 405: mutation attempted on a read-only business endpoint.
- 409: evidence/source version changed or metric no longer validated.
- 503: backend unavailable or pending shared-read migration; no fallback to raw/example data.

Unknown/unmapped/unavailable metrics retain their existing validation states. A read-only user with no authorized measures sees an administrator-guidance state rather than a misleading request to connect company sources.

## Cache and revocation behavior

`useCompanyIntelligence` verifies `/context` before restoring a saved snapshot on a fresh mount. Cache keys include actor, company, server role, current authorization fingerprint, reporting context key and dataset revision. Legacy executive-only cache entries cannot satisfy the new proof. No cross-context or cross-permission fallback is allowed.

- Fresh authority failure or access denial clears cached/displayed facts and fails closed.
- Once access is verified, a failed business-report refresh can retain the last authorized report with the existing saved-report/error wording.
- During an active source refresh, a previously displayed, still-authorized report may remain as the last saved revision while updating. Its evidence token remains pinned and is rejected if no longer current. A fresh mount does not restore a cache for a different revision.
- Reads revalidate on mount, source changes, retry, focus and a 15-second interval. Permission fingerprints change with role, department scope, policy or allowed-source changes. Async request sequencing prevents an older response replacing a newer permission denial.
- Evidence is not stored in a cross-navigation browser cache; it rechecks on access, retry, focus and the same interval. Denial or revision mismatch removes displayed evidence.
- Logout uses existing overview-cache cleanup. HTTP responses are never shared-cacheable.

Revocation is enforced by the server on every request. A browser cannot retract data already seen; a mounted page observes remote changes at the next revalidation (up to the polling interval, or on focus/request). No instantaneous push-revocation claim is made.

## Verification

- **86 automated tests passed**, including exact comparison to the unchanged engine/legacy result, all roles, no-category default denial, finance sensitivity floor, distinct payroll/confidential grants, record-column redaction, source-management denial, cross-tenant/source IDs, removed memberships/departments, malformed policy, no actor/role query impersonation, and direct SQL denial for browser roles.
- Hidden overlapping source IDs still invalidate an otherwise permitted metric; private worksheet names/sample values are excluded from all shared evaluation interfaces.
- Concurrent replacement test proves one read supplies metric and rows, and the old revision is rejected on the next read.
- Cache tests cover actor, company, same-role changed grants/departments, reporting context, source revision and rejection of legacy unproven entries.
- **13 serverless browser journeys passed**, including existing account/onboarding/ingestion/mapping/stabilization journeys plus the new authorization-before-cache, denied/unavailable authority, real source replacement, stale citation, context-return and tenant-switch journey.
- Frontend TypeScript check and production-mode Vite build passed. Existing >500kB chunk warning remains. No stylesheets/design tokens changed.

Tests use isolated PGlite/serverless/provider fixtures, not production users or live external providers. The final permissions browser group restarts its isolated database to avoid exhausting the real login quota shared by other test groups; production rate limits are unchanged.

## Changed files

Under `aynor-onboarding-frontend/source/`:

- New `server/intelligence-service.mjs` and `server/intelligence-policy.mjs`.
- `server/source-catalog.mjs`, `server/sheets.mjs` — shared delegation and read-only routing; existing source writes retain guards.
- `server/contracts.mjs` — validated optional access policy.
- `server/database.mjs` — explicit pending-migration failure message.
- New `src/features/live/useCompanyIntelligence.ts` and `intelligence-cache.ts`.
- `src/features/live/LiveOverview.tsx`, `BusinessEvidence.tsx`, `GovernedOverview.tsx` — shared reads, revision context and read-only empty-state copy, using approved components.
- `src/features/live/dashboard-navigation.ts`, `semantic-types.ts`; `src/lib/api.ts` — shared context/DTO/access types.

Repository-level:

- `supabase/migrations/202611010001_intelligence_read.sql` — additive server-only coherent-read function; no new tables or destructive SQL.
- New `tests/intelligence-service.test.js`, `intelligence-policy.test.js`, `intelligence-cache.test.js`, `intelligence-permissions.browser.mjs`.
- `tests/fixtures/serverless-database.mjs`, `tests/semantic-catalog.test.js`, `tests/database-errors.test.js`.
- `tests/overview-loading.browser.mjs`, `tests/import-feedback.browser.mjs`, `tests/ux-stabilization.browser.mjs` — route changes and valid department context in existing regressions.
- `scripts/test-serverless.mjs`; this document.

## Release prerequisites, risks and remaining limits

1. **Not deployed.** After release approval, the additive intelligence-read migration must be applied before deploying the new application. Missing migration produces an explicit 503, not a permission-bypassing fallback. Do not apply production SQL as part of this review.
2. Explicit grants/classification are configured through the existing Owner/Admin configuration API; a permissions editor is outside 4A. Non-admin readers deliberately see no new business data until configured.
3. Dataset classification is administrator-controlled. There is no automatic payroll/PII detection, per-user column editor, or mixed-worksheet row ACL. Record columns are explicitly projected and sensitive aggregates remain gated by worksheet sensitivity.
4. Relationships return `not_configured`/an empty list; confirmed business relationship production belongs to 4C. No technical/name-based links are promoted here.
5. Other modules and Ask are not connected yet; no targets, tasks, conversations or AI business answers were implemented.
6. Additional authority roundtrips and periodic revalidation increase read traffic. No shared response cache was introduced to optimize it prematurely.
7. The legacy root SQLite development runtime has not gained an independent intelligence implementation. Use the deployed serverless application path or its local fixture for 4A; there is no example-data fallback.
8. Existing formulas, mapping confirmations, ingestion and Owner/Admin Overview behavior are unchanged. Role/context projection and explicit read-only guidance are the intended permission-related behavior changes.

Stop here for 4A approval. Do not begin 4B or deploy.
