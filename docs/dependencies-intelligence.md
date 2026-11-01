# Milestone 4C — Dependencies

4C only. Hosted Dependencies now reads the shared governed intelligence service rather than prototype example projects, name-derived joins or browser-local calculations. The offline prototype remains available separately. Goals and Ask Aynor are unchanged. No deployment, production database migration, AI relationship inference, severity scoring or forecasting was performed.

## Business behavior

The module leads with supported shared-resource facts, followed by confirmed relationships, relationship validation checks and administrator mapping review. It uses the existing ModulePage, Panel, Status, Blank, field, button and modal components. There are no CSS, design-token, header/sidebar styling or navigation destination changes. The existing reporting-scope selector can show either authorized endpoint, including a register without a validated executive KPI.

Owner/Admin explicitly confirms a source worksheet, its entity type and unique ID, a reference ID column, and the target worksheet's entity type and unique ID. Optional display names are separately selected. Confirmation is persistent company configuration. There is no automatic approval of a suggested join and no fuzzy, normalized-name or similarly named entity matching.

The MVP supports project, resource/employee, invoice, deal and client endpoints. Project/resource/invoice/deal endpoints must agree with their confirmed semantic entity. A client register uses an explicitly confirmed `other` entity plus an explicit client relationship mapping; it is not thereby promoted into financial KPIs. Employee is an explicitly selected resource alias, not an inferred person identity.

A relationship is confirmed only when:

- Both worksheets have enabled semantic confirmations, current table schema, the same confirmed identity namespace as the relationship mapping, and the configured unique-ID field.
- Both endpoints' confirmed reporting periods match exactly, independently of navigation period labels. Current snapshot dates follow the company timezone. Dated intervals select only records in that interval; undated changed tables require the existing explicit reporting-scope reconfirmation.
- The source reference matches the target ID **exactly and with its type preserved**. Text `001`, text `1`, numeric `1`, differently cased strings and whitespace variants are distinct. There is no ID coercion, delimiter splitting or name-based fallback.
- Source and target IDs each identify one row inside their respective reporting scope. Missing/unsafe IDs and duplicate-ID rows are excluded; one ambiguous ID does not multiply rows or suppress unrelated valid matches.
- Sources are fresh under the existing semantic freshness-hours setting and have no worksheet error/skipped state. Numeric identifier joins require available raw source values with preserved integer formatting; original leading-zero loss or unsafe numeric evidence blocks the join.
- One reference column does not have contradictory target identity definitions. Contradictory contracts fail closed; scoped readers receive an administrator-review explanation without privileged conflict details.

A shared-resource concern requires at least two distinct confirmed project identities referencing the same confirmed resource identity in the same period. Counts deduplicate project identities across contracts and include only authorized relationships in the requested scope. The explanation recommends reviewing commitments and explicitly does not establish overlapping work, insufficient capacity or a predicted delay. It is a supported business fact, not a speculative risk score.

## Shared service interfaces

The existing `createIntelligenceService` owns reads and authorization. `relationship-intelligence.mjs` is its deterministic relationship evaluator, not another KPI calculator. Existing semantic metric definitions and calculations are unchanged.

`GET /api/companies/:company/intelligence/relationships`

Accepts the existing reporting context: `scope`, `department`, `period`, repeated `tag`/`filter`, `q`, `status`. Returns:

- `version`, `companyId`, `datasetRevision`, `authorization`, `context` from the shared service.
- `relationships`: stable opaque IDs, contract ID/label, authorized endpoints, exact confirmed period, validation state and an explainable join definition. Each endpoint has its opaque ID, confirmed identifier/type, permitted display name, department and worksheet scope.
- `scopes`: authorized endpoint worksheet choices for the existing reporting selector.
- `concerns`: deduplicated shared-resource facts and investigation links represented by relationship IDs.
- `diagnostics`: authorized-contract states (`validated`, `partial`, `needs_review`) with missing/duplicate/reference checks and clear recovery guidance.
- `state`: overall `not_configured`, `needs_review`, `partial` or `validated`.
- Owner/Admin only: `configuration.contracts` and worksheet mapping choices. Raw record values are not included in those choices.

`GET /api/companies/:company/intelligence/relationship-evidence?relationshipId=...&revision=...`

Uses the same reporting context. Reloads current membership, policy and source state, requires the exact current dataset revision, and recomputes the authorized relationship. Returns only the two contributing normalized snapshot rows and confirmed identity/reference/display columns, with parent workbook/page names and normalized row references. Changed revisions return 409; unavailable or unauthorized relationship IDs return the same 404. A caller cannot use an old relationship ID to retrieve a restricted endpoint. No historical row archive is introduced.

## Configuration and persistence

`company.data.relationshipContracts` is an optional strict array of at most 30 contracts, validated by `workspaceSchema` and saved using the existing Owner/Admin-only version-checked company PATCH. No new table, SQL migration, write RPC, browser database permission or production migration is required.

Each contract contains:

```json
{
  "id": "<uuid>",
  "label": "Projects reference assigned resources",
  "from": {
    "scope": "<source-id>:0",
    "entity": "project",
    "idColumn": "Project ID",
    "labelColumn": "Project name",
    "namespace": "projects",
    "schema": "<confirmed table schema>"
  },
  "to": {
    "scope": "<source-id>:1",
    "entity": "resource",
    "idColumn": "Resource ID",
    "labelColumn": "Person name",
    "namespace": "resources",
    "schema": "<confirmed table schema>"
  },
  "foreignKey": "Resource ID",
  "confirmed": true
}
```

The UI obtains schemas and namespaces from the authorized mapping choices. It reads current company configuration before saving, compares contracts without depending on JSON object-key order, and uses the existing company-version CAS to avoid overwriting concurrent edits. Failed writes retain the draft. Editing a stored contract is covered by the browser test. A confirmation saves the mapping declaration; runtime validation still decides whether any rows support a relationship. Configuration, semantic meanings and source records remain separate.

## Permissions, context and caching

4A's tenant membership, category/sensitivity grants and departmental scope rules apply unchanged. **Both endpoints and the source ID/reference and target ID columns must be authorized before a contract, relationship, concern, scope label or diagnostic is returned.** A visible source worksheet does not grant access to the referenced worksheet. Optional name columns are independently withheld if not allowlisted; the permitted identifier remains available. No aggregate concern uses hidden relationships. Privileged contract configuration never reaches scoped roles. Row-level ACLs inside a worksheet remain unsupported, as in 4A.

A department filter includes relationships touching that department only where both endpoints are independently authorized. It does not grant access to a neighboring department. A worksheet scope selects relationships touching that worksheet; cross-department evidence remains subject to full endpoint authorization. Company, department, worksheet scope, period and repeated filters survive investigation, evidence, Data Connections correction and returning navigation. Same-company return paths are allowlisted; cross-company/external paths are rejected. Calendar period URLs are retained navigation context, not implicit recalculations; displayed relationships carry their exact confirmed periods. Search filters the visible relationship list, not the underlying business facts.

The browser uses the shared authority proof/cache. The relationship view itself is component memory keyed by authorization fingerprint, dataset revision and reporting context; no persistent browser intelligence store is added. Same-context refresh retains visible relationships; loss of authority or mismatched source revision clears them. Read failures have one recovery control. Empty, partial, stale/mapping-review, missing relationship, loading and error/retry states are explicit. Evidence is cleared/revalidated when its relationship or reporting authority changes.

## Acceptance and remaining limits

Focused tests cover deterministic exact references, missing/duplicate IDs, unresolved references, unsafe numeric formatting, namespace changes, explicit client/invoice mappings in a different workbook structure, contradictory mappings, same-period scope, cross-department permissions, restricted labels/counts/diagnostics, tenant isolation, evidence revision handling and exact KPI consistency. Browser tests cover creating and editing persistent mappings, investigation/evidence/return links, resource-scope selection, department filters, Data Connections return, retained refresh, empty/partial/error/retry states, mobile mapping-dialog reachability and overflow checks at 390/768/1440px.

Unsupported in this MVP:

- Fuzzy names, automatic entity reconciliation across registers, inferred joins, cross-company relationships or inferred ownership.
- Composite keys, allocation bridge tables with repeated source entity IDs, comma-separated multiple references, partial-period overlap joins or multi-hop/cycle analysis. One reference column maps to one explicitly confirmed target identity; more source columns can have independent contracts.
- Capacity shortage/critical-path inference, predictive scoring, financial aggregation through relationships, automatic Action creation or AI recommendations.
- Automatic sensitive-data classification or per-record ACLs within a worksheet. Existing worksheet/category/sensitivity/column grants remain authoritative.
- Archived historical source-row replay, graph visualization redesign, pagination/virtualization for very large relationship sets, or automatic repair of schema/namespace/period conflicts.
- Live production tenant/Google validation. All acceptance fixtures are synthetic and local; production was untouched.

Stop after 4C for approval before 4D.

## Recorded verification

Final local results: **96 automated tests passed**, **15 full serverless browser journeys passed**, **7 focused relationship scenarios passed**, frontend TypeScript project build passed, and production-mode Vite build passed with its existing bundle-size warning. The final focused browser pass also verified retained evidence while refreshing. CSS output remains `index-dH7GHMWQ.css`.

Full screenshots, logs and changed-file inventory: `/workspace/artifacts/milestone-4c/README.md`. Implementation commits: `c0e258d`, `6b51215`, `7870789`. No production deployment or migration was performed.
