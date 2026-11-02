# Milestone 4E — Ask Aynor

Implementation for review only. No deployment or production migration was performed. Real-model acceptance is **pending by user instruction**; no real OpenRouter inference calls were made in this workspace.

## Shared contract and execution

The authenticated `/companies/:id/intelligence/ask` service exposes GET status and POST `/policy`, `/consent`, `/turn`. Turn inputs contain a bounded question, request UUID, existing reporting context, optional focused fact and opaque conversation token. Outputs separate validated facts/administrator targets, interpretations, suggested investigations, evidence links, clarification, fallback reason and actual inference-attempt counts.

`buildAskFacts` reads one authorized shared-intelligence state. Metrics remain calculated by the governed engine; goals and actions reuse exported existing projections; relationships reuse confirmed identifier mappings. No new business calculation engine or inferred joins were added. The bundle proof binds dataset revision, permissions, reporting context, current facts and company-local date. Evidence URLs use the existing authorized investigation routes.

The model interprets questions and selects a structured plan: financial explanation, compatible comparison, goal assessment, confirmed dependency, separate observations or investigation. The server validates references and dimensions, then renders the business claims from governed DTOs. Unknown IDs, free prose, unsupported operations, tool calls, incompatible comparisons and malformed responses fail closed to a clearly labeled deterministic fallback. Missing values never become zero. Targets are distinguished from observations; owner labels are not validated source identities.

One inference normally suffices. A bounded catalogue can request necessary missing values for one second call; no third call is allowed. Context is capped at 20 KB and output at 1,200 tokens. Provider errors, quota exhaustion and unavailable privacy-eligible routes never silently enable paid routing.

## Consent and privacy

Owner/Admin enables external processing by Finance, Sales, Delivery and Resources categories. Each user grants a separate understandable, durable, revocable approval for their permitted category set and approved provider/privacy route. Mapping-AI consent is unrelated. Category or provider-policy changes require renewed consent; ordinary questions and source updates do not.

Only minimum authorized governed fact values and aliased metadata are external. Source URLs/names, raw rows, headers, arbitrary records, private notes, manual tasks, goal titles and owner labels are omitted. Payroll-sensitive sources are ineligible externally. Known entity/department names and identifiers are aliased; links, email addresses and recognizable credentials are redacted. Obvious pasted tables are withheld. Free-text questions cannot be guaranteed to contain no personal information, so the consent disclosure tells users not to enter confidential material or credentials.

Default routing requires a pinned free model/provider, no provider fallback, collection denial and ZDR. Optional `reviewed` retention mode requires an explicit operator privacy review and is disclosed to users; collection denial alone is not represented as zero retention. The service does not send unrestricted history or old model prose.

## Authorization, memory and concurrency

Tenant and role authorization applies before retrieval, before each outbound call, and before delivery. Final durable completion checks current company/source revision, membership scope, action revisions, consent and authenticated session. Permission/consent/source changes reject stale responses and invalidate old history. Current-goal/company configuration changes also alter the proof. No provider request holds database locks.

Memory tokens are encrypted/authenticated using a domain-separated key, bound to company, actor and real session; max ten turns, last three redacted questions, selected fact identifiers, 30 minutes or session expiry. All values are retrieved anew. Browser transcript memory is session-local, proof/consent-scoped and cleared on logout/company changes. SPA evidence returns restore it only after fresh authorization; full reload starts a new conversation. Durable encrypted request results expire after 30 minutes and prevent duplicate charges on retries. Revocation deletes cached requests. No permanent chat archive is introduced.

## Configuration and cost controls

Existing `OPENROUTER_API_KEY` is reused server-side. Ask is separately gated:

| Variable | Meaning/default |
| --- | --- |
| `AYNOR_ASK_ENABLED` | `true` enables configured Ask provider |
| `AYNOR_ASK_MODEL` | Explicit pinned `:free` model, checked against zero pricing |
| `AYNOR_ASK_PROVIDER` | Explicit pinned eligible provider slug |
| `AYNOR_ASK_PRIVACY_APPROVED` | Explicit operator `true` |
| `AYNOR_ASK_PRIVACY_POLICY_URL` | Reviewed HTTPS policy |
| `AYNOR_ASK_PRIVACY_REVIEWED_AT` | ISO timestamp, within 90 days |
| `AYNOR_ASK_PRIVACY_MODE` | `zdr` default; `reviewed` only after retention review |
| `AYNOR_ASK_BILLING_MODE` | Only `free` accepted; paid calls unsupported |
| `AYNOR_ASK_USER_DAILY_LIMIT` | 5 questions per user across companies, cap 100 |
| `AYNOR_ASK_COMPANY_DAILY_LIMIT` | 20 questions, cap 500 |
| `AYNOR_AI_APPLICATION_DAILY_LIMIT` | 40 actual calls across mapping, Ask and diagnostics, cap 100 |
| `AYNOR_AI_DIAGNOSTIC_GLOBAL_DAILY_LIMIT` | 5 diagnostic calls within the same application ceiling |
| `AYNOR_ASK_OUTPUT_TOKENS` | 1000 default, cap 1200 |
| `AYNOR_CHAT_STATE_KEY` | Encryption key; otherwise existing `SHEETS_ENCRYPTION_KEY` |

Zero disables a quota. Limits use durable SQL rate-limit reservations; failed attempts can consume reservations and are not silently refunded or bypassed. Request-result replay consumes no additional provider call. Free availability and provider rate limits are not guaranteed. Paid models can later use the isolated transport/provider boundary, but require explicit approval and implementation/configuration changes; there is no paid fallback now.

Migration `202611020001_ask_runtime.sql` creates service-only consent/replay storage and a fenced runtime RPC. It was exercised in local PGlite only. Production application requires separate approval and operational review; existing ingestion and mappings are unchanged.

## Acceptance and limitations

Automated tests use varied synthetic finance, delivery, resource, relationship and goal structures through real shared-service/SQL paths, with a controlled provider. They cover category/user consent, aliases, grounding, dimensional compatibility, follow-ups, explicit clarification, revision races, permission changes, cross-tenant replay, quota exhaustion, provider failure, malicious plans, concurrent requests and browser navigation. Screenshots demonstrate synthetic data only.

`node scripts/accept-ask-live.mjs` reports pending with zero calls by default. A future explicitly authorized run requires `AYNOR_RUN_SYNTHETIC_LIVE_ACCEPTANCE=true`, the approved privacy/free route and key. It sends only fixed synthetic facts/questions, validates plans, caps calls at four and prints no credentials. Human executive-quality acceptance remains necessary even after protocol validation.

Known MVP boundaries: explanations are constrained to compositional server-rendered reasoning operations; unrestricted model prose is intentionally rejected. Open-ended reasoning quality is not yet verified with a real model. No raw-record Q&A, arbitrary field discovery, cross-period trends, forecasts, inferred causes/joins, task execution, paid models or permanent chat history. Relative period support is deliberately narrow; ambiguous/unsupported periods request clarification. Large catalogues are bounded, so users may need a narrower scope/question. Configured free ZDR routes may be unavailable, in which case deterministic mode remains available. Build retains the existing bundle-size warning; CSS/design tokens are unchanged.

## Local review results

- `npm test`: **115 passed**, zero failed.
- `npm run test:serverless`: complete existing ingestion/auth/dashboard/module suite plus Ask journey passed.
- Final isolated Ask desktop/mobile journey passed after composer sizing adjustment, widths 390/768/1440.
- `npx tsc --noEmit -p aynor-onboarding-frontend/source/tsconfig.json`: passed.
- Built design-system CSS remains `index-dH7GHMWQ.css`; no CSS files changed.
- Real-model acceptance runner reports pending/zero calls, as requested.
- Review artifacts and changed-file inventory: `/workspace/artifacts/milestone-4e/README.md`.

Reviewable implementation commits: `ba999ef`, `58af057`, `1b939b8`. The runtime migration remains unapplied to production. No Milestone 4F work was started.
