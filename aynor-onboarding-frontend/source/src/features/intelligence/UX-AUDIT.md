# MVP UX gap assessment and implementation contract

Audit date: 26 October 2026. Scope: frontend only. The approved Overview, onboarding and shell establish all type, color, surface and spacing choices. No backend packages, endpoints, schemas, auth configuration or integrations will be introduced.

| Screen                       | Existing state / gap                                                  | Refined hierarchy and interactions                                                                                 | States / return path                                                                                |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Overview                     | Approved chart, risks, matrices, modals and empty-state recovery work | Preserve appearance; connect investigation links to dedicated modules                                              | Existing warnings, mock/empty states and setup recovery retained                                    |
| Departments list             | Only an Overview anchor and matrix                                    | Compact prioritized matrix; All/Attention/Limited filters; search; period; department and issue links              | No setup, unmapped fields, no matches, no issues; filters in URL                                    |
| Department detail            | Small evidence modal only                                             | Name/period, supported KPIs, issues, records, related dependencies, contextual assistant                           | No measured fields rather than invented KPIs; parent/origin return                                  |
| Metric detail                | Evidence/calculation modal                                            | Definition, exact value, suitable trend or snapshot breakdown, method/source, related actions                      | No history for snapshots; missing source; deep links and return context                             |
| Dependencies list            | Three connected names on Overview                                     | Focused project relationships, graph/list alternatives, entity type/search, bounded zoom                           | No graph, unknown products, missing identifiers, many entities; query-preserved view                |
| Entity / relationship detail | Same project evidence in a modal                                      | Connected entities, relation explanation, supported impact, department/action links                                | Removed entity, no risks, cached evidence, back to prior entity/graph                               |
| Goals list                   | Configured goals and two previews on Overview                         | Active/attention/achieved/paused/archive filters; actual vs target; create                                         | No goals, unknown measure, deadline passed; URLs retain filter/period                               |
| Goal create/edit             | Existing onboarding fields only                                       | Existing Goal contract plus browser-local scope/tracking/baseline metadata; manual or supported metric; validation | Draft restoration, invalid target, unavailable connected metric, saving/error; discard confirmation |
| Goal detail                  | Overview evidence only                                                | Actual/target, deadline, real manual history, connected evidence/actions; update, pause/archive/delete             | No invented progress/history; archive/delete confirm; return to originating list                    |
| Actions list                 | Three transient Overview recommendations                              | Severity-first rows and explicit user lifecycle; status/department search                                          | No recommendations, source unavailable, completed/dismissed filters                                 |
| Action detail                | Evidence + local decision note modal                                  | What/impact/evidence/recommendation; accept/in-progress/complete/dismiss; user decision separate                   | Failed local save/retry, changed evidence/outdated notice; local notes retained                     |
| Assistant home               | Contextual simulated question modal                                   | Minimal company-relevant questions, composer, history access                                                       | No company data; no generic charts; local-preview disclosure                                        |
| Conversation                 | No persistent thread or investigation links                           | Answer/evidence/source/calculation, follow-ups, links and originating context                                      | Thinking/retrieval/stream/complete, ambiguity, no data, unavailable source, failure/retry           |
| Settings profile             | Existing onboarding edit form                                         | Reuse existing profile PATCH contract through local mock; profile/currency/timezone/priorities                     | Draft, validation, permission restriction, saved/error                                              |
| Settings departments         | Onboarding step only                                                  | Existing configuration and mapping summaries; reuse step with settings return                                      | No teams, missing mapping, admin-only editing                                                       |
| Settings connections         | Onboarding connection UI only                                         | Configured sources, evidence/freshness, simulated refresh/reconnect, remap/remove                                  | Missing connection, expired/failure/partial, busy retaining content; destructive confirm            |
| Team permissions             | Working members/invitations/roles                                     | Preserve existing screen and routes; connect Settings navigation                                                   | Existing roles, errors, loading and invitation journeys retained                                    |
| Dashboard preferences        | Working Overview Customize modal                                      | Same stored preferences in Settings; optional sections/order, metrics/period/departments                           | Per-user/company persistence, no hiding critical context, failed storage feedback                   |

## Shared implementation patterns

- Preserve six primary navigation identities. Add dedicated company-scoped routes for modules and details. Keep old Overview hash routes working.
- Shared module header, period selector, compact rows/cards, evidence blocks, empty states, errors/retry, local-save feedback, confirmations and contextual links.
- Existing browser mock API remains the only API implementation. Goals/profile/setup reuse its contracts. Unsupported goal metadata, decisions and conversations are explicitly browser-local, keyed by user/company.
- Reporting preferences use the existing dashboard key. Detail/conversation links carry period, source scenario and a validated originating route. URL filters and bounded graph zoom survive browser history.
- Draft persistence protects form edits during navigation; explicit discard confirms. Destructive operations confirm; ordinary navigation does not.
- Available sample records may support calculations; missing metrics, fields, identifiers and historical points remain unavailable. No invented pipeline/campaign/product statistics or unsupported AI conclusions.
- Refresh, reconnection and assistant generation are simulations with labeled states; they do not call Google, AI, email or operational services.

## Ordered implementation / validation

1. Departments: list → detail → metric → contextual assistant; verify scoped fields and empty states.
2. Dependencies: graph/list → entity → relation → action; verify filters/zoom/from restoration.
3. Goals: create → detail → manual progress → edit/pause/archive; verify validation, drafts and actual/target semantics.
4. Actions: Overview issue → evidence → accept → progress → complete; verify persistent status, dismiss reason and failure/outdated states.
5. Assistant: company-relevant question → staged response → source metric → conversation return; verify context, history and unsupported questions.
6. Settings: warning → connection → reconnect/remap → refresh → originating dashboard; verify permissions, preferences and unchanged team workflows.

Build and browser-test all seven requested end-to-end journeys plus direct links, Back/Forward, storage isolation, responsive overflow, missing-data states and zero backend requests. Record limitations honestly; production readiness requires validated backend records, server permissions and real integrations later.

## Implementation outcome

All six modules now have dedicated screens and contextual links using the existing company shell. The original Overview layout and chart treatment remain intact. Existing onboarding and team screens are reused for configuration instead of duplicating their business contracts. Source recovery returns to the originating settings/dashboard context. Unavailable metrics, incomplete setup and restricted departments retain honest empty states.

Validation completed: seven requested end-to-end journeys; department/metric and dependency returns; manual goal progress; persistent action lifecycle; contextual assistant evidence return; remapping/reconnect/refresh; actual returning sign-in to the same saved decision. Additional checks cover draft recovery/discard, failed local writes and retry, disconnected/stale sources, unknown routes, role scope, assistant failures and responsive layouts. Existing Overview, shell and onboarding regressions pass with zero backend requests.

Integration limitations: AI generation and source operations are simulated; authorization is a frontend demonstration; production data ingestion, real server permissions and external services are intentionally outside this implementation. Uploaded data is not treated as validated business performance.
