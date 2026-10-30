# Automatic imports and free-only AI assistance

## Customer behavior

Connecting Google Sheets, uploading Excel/CSV or adding a shared URL now starts server-side preparation automatically. It discovers table headers and column properties, suggests an existing department, validates the complete retained dataset and saves normalized records using the existing leased catalog/snapshot pipeline. A ready card offers **Open dashboard**, **Review mapping**, and only the quick checks that matter. Normal onboarding skips the manual mapping screen when all available pages are prepared and no questions remain. Existing business-priority, goal and review steps are preserved.

Dates with ambiguous day/month order stay as original text until answered. An answer revalidates the full table and updates its reporting. Financial totals are computed only by deterministic code from clear, validated Date/Revenue/Expenses roles; invoice/payment/tax/currency ambiguity requires a choice, mixed currencies withhold totals, and missing/invalid financial values never become zeros. Identifiers and leading-zero codes stay text. Mixed-type columns can remain text so a workbook stays usable without fabricated numbers. Cover/empty pages are marked as having no records rather than producing empty metrics. Unsupported layouts retain saved data and offer manual editing.

Manual column/department changes remain available, are persisted, and are not overwritten by later automatic preparation. Valid saved interpretations are reused on re-preparation and sync; AI is not called for every row update. Structure changes retain existing sync guards and may require re-preparation/review. Skipped pages are not silently reinstated. Existing authentication, account recovery, permissions, source coexistence and financial APIs remain intact.

## Enable live optional AI (Vercel project → Production environment variables)

1. Create an OpenRouter API key in your account. Do not put the key in the repository, a `VITE_` variable, a screenshot or chat.
2. Add **`OPENROUTER_API_KEY`** as a server **Secret** with that key as its value.
3. Add **`AYNOR_AI_ENABLED`** as Config with value **`true`**.
4. Redeploy. The visible option defaults to checked, as requested, and Owners/Admins can opt out using **Use optional AI for unfamiliar labels** when preparing a workbook.

No new SQL, package, OAuth scope, Supabase credential or backend host is required. Without both settings, the same automatic workflow uses local detection and does not contact an AI service. To disable AI immediately, remove the enable flag or set it to `false`, then redeploy. OpenRouter account eligibility, free quotas and privacy settings still determine live provider availability. This implementation does not require buying credits or attaching billing; do not enable a paid model as a workaround.

Optional server configuration:

| Variable                         | Default                                          | Enforcement                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AYNOR_AI_MODEL`                 | Discover an eligible zero-price model at runtime | Only `:free` model IDs or the free router are considered; the returned model catalogue must show every listed price as zero. Unavailable/nonzero models are rejected. |
| `AYNOR_AI_GLOBAL_DAILY_LIMIT`    | 20 inference attempts                            | Durable shared counter, max 100/day. Zero, negative or invalid configuration disables inference.                                                                      |
| `AYNOR_AI_WORKSPACE_DAILY_LIMIT` | 2 inference attempts                             | Durable company counter, max 5/day. Zero, negative or invalid configuration disables inference.                                                                       |

Daily counters use UTC dates and conservative 24-hour rate-limit windows. Reservations count attempted calls, including failures; they are never refunded/retried automatically. Lower provider limits simply trigger local fallback. The number of registered users is not an unlimited free-AI allowance.

## Free-only and data boundaries

- The server uses only the fixed OpenRouter HTTPS models/chat endpoints, refuses redirects and sets timeouts and response-size limits.
- It checks live model pricing before inference, requires a free-model identity, sets provider prompt/completion price ceilings to zero and disables paid/provider fallback. It requests no tools, plugins, web search, agent actions or calculations. No user-supplied provider URL or model override is accepted from the browser.
- The AI receives only selected workbook labels, inferred column names, department labels and type/missingness summaries. It receives no data-row samples, amounts, date values, URLs, credentials or record identifiers. Headers/titles can themselves contain personal information, so the visible external-analysis option defaults on, can be disabled before import, and remembers that user’s choice per workspace and the operator must review applicable provider/privacy terms. Email/link/long-number patterns in metadata are redacted.
- The prompt treats spreadsheet metadata as untrusted data. Model JSON is untrusted too: tab IDs, column counts, allowed properties and existing departments are checked, then every value is validated against the complete dataset. AI cannot exclude columns, erase IDs, guess an ambiguous date order, create a department or authorize financial meaning. It can propose unfamiliar revenue/expense columns, but they remain ordinary currency values until a user explicitly confirms the proposal. Invalid suggestions are discarded.
- Provider errors, bad JSON, privacy-routing rejection, timeouts, retired models and exhausted quotas fall back to deterministic preparation. No API key, provider diagnostic, response body or raw prompt is returned to customers or logged.
- No app path intentionally invokes paid inference. This is an application routing policy, not a contractual guarantee about an external provider's future pricing or availability. Recheck the provider's current terms before enabling live use. OpenRouter was tested through controlled responses; no production API key was available in this workspace.

## Implementation and validation

- `source/server/automatic-mapping.mjs`: deterministic interpretation, full validation, meaningful questions, privacy-limited metadata and guarded AI proposal merging.
- `source/server/free-ai.mjs`: free-only model discovery/routing, durable caps, timeout/bounds and safe fallback.
- Existing `POST /companies/:company/sources` continues to connect a source without changing its API contract. The frontend follows it with `POST /companies/:company/sources/:source/prepare`. Preparation is bounded and paged (10 uploaded or 3 remote tabs per request), serialized by the existing lease. The frontend waits until preparation completes before advancing onboarding.
- `POST /companies/:company/sources/:source/answer` applies an explicit quick-check answer against the current sheet, then validates and persists the result. Owners/Admins only. Schema drift requires re-preparation instead of applying an answer to the wrong columns.
- `tests/automatic-mapping.test.js` verifies full-data checks, private-value omission, identifier/date safeguards, provider routing, daily caps, zero-budget behavior, malformed/429 fallback, real PostgreSQL persistence, cold-instance cache reuse, tenant permissions and retained manual overrides.
- `tests/automatic.browser.mjs` exercises automatic upload-to-dashboard behavior, no mandatory mapping, date clarification, controlled free AI, saved interpretation reuse, manual correction, quota fallback and responsive layout. `npm run test:serverless` also retains all six existing customer/source/auth journeys.

## Feedback fixes (30 October 2026)

- Data connections is a primary navigation destination at `/companies/:id/connections`; old settings links still resolve. Its source-method tabs filter their own workbooks, while mapping covers all methods. Workbook rows expand into pages, with parent-level department assignment and per-page overrides.
- Optional AI defaults on when configured, with the existing metadata disclosure and a remembered per-user/per-company opt-out. Free-only routing, caps, no-row-data policy and deterministic fallback are unchanged.
- Duplicate connections return an explicit already-connected response; identical uploads do not add a copy or replace mappings. Updated same-name uploads report an update. Successful imports also show a toast and a sticky status message.
- Mapping checks scan every retained row and column. They report up to 50 concrete cell issues and a full conflict count. Save remains available without a department: unassigned is an explicit choice. Closing an editor with the onboarding Back button returns to the page list.
- Full dates accept ISO and month names, including formatted timestamps; numeric date order remains explicit. True Google date cells displayed without a year are read with their stored year. Yearless text dates require an explicit year, with independent per-column years and orders. Invalid dates are not silently repaired.
- Combined overview KPIs use validated financial roles, grouped by currency. Matching financial pages are excluded until the user selects the reporting copies. Inclusion is remembered per user/workspace in browser storage. Company currency is the disclosed fallback when a page has no currency. Arbitrary numeric columns, identifiers and spreadsheet fill statistics are not business KPIs. Raw worksheet statistics and records are available in an optional explorer.
- Initial source loading no longer renders a false empty state. Refreshes retain the existing catalog and report; failed validation does not erase previously saved data. No new database migration or Google scope is required.

## Dashboard loading and live AI diagnostics

The last successful overview is retained per authenticated user, company, role and currency, in tab-local session storage with an in-memory fallback. It is shown while new data is requested on navigation and reload; failed refreshes keep the last report. Logout/session expiry clears this cache in each notified tab; authorization failures discard the affected snapshot. A first visit without a snapshot renders four KPI placeholders, a chart skeleton and detail placeholders, never fake KPI values.

Data connections shows whether a workbook used local preparation or received an AI response. **Test live AI connection** makes a capped free-only request with synthetic labels and no sheet data. It reports missing configuration, invalid credentials, credit/budget rejection, provider access/routing problems and quotas separately. A configured key or checked checkbox is not proof of successful AI inference. Diagnostic requests have a separate small allowance and never raise a spending limit.

Connection checks also expose safe stage information: whether the enable flag and key are present, whether inference was attempted, and the provider HTTP status when available. Leading/trailing whitespace in copied API keys and enable flags is normalized. The test remains available when configuration is missing so it can identify the absent setting. A “Never used” provider dashboard label is not substituted for these diagnostics, and no successful live call is claimed without an actual response.

Connection tests have a separate durable allowance so exhausted automatic-mapping quotas do not prevent testing the deployed key. Defaults are two tests per company and five across AYNOR per UTC day; failures count. Optional `AYNOR_AI_DIAGNOSTIC_WORKSPACE_DAILY_LIMIT` (maximum 3) and `AYNOR_AI_DIAGNOSTIC_GLOBAL_DAILY_LIMIT` (maximum 10) can lower/disable these limits. Tests use synthetic metadata hardcoded by the server, a 512-token output cap, the same verified free-only model selection and zero-price routing, and Owner/Admin authorization. Normal mapping quotas are neither reset nor consumed. Explicit zero/invalid normal inference limits still disable inference. Diagnostic-limit responses identify the affected allowance and report that no inference was attempted.
