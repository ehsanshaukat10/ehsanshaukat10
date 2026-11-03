# Implementation boundaries

The current application is a functional development system, not a production-certified intelligence service. It includes a real local authentication/company backend and clearly labeled integration/delivery adapters.

## Required before public release

1. **Identity and verified email delivery.** Add an authenticated mail provider, trusted application origin, signed verification/reset links, durable delivery status/retries, and Google OIDC with server-side state/PKCE, nonce, issuer/audience validation, account-linking protections, and cancellation handling. Production currently rejects delivery-dependent operations. Do not expose development verification tokens publicly.
2. **Google Sheets integration.** Implement server-side company-scoped OAuth, minimal read scopes, encrypted refresh-token storage in a managed secret store, disconnect/revoke, token refresh, authorized file listing, selected-tab reads, quota backoff, and actual connection checks. There is no current Google OAuth callback or live token storage. Tokens must never enter frontend persistence.
3. **Data processing.** Replace built-in source definitions with actual ingestion jobs, resumable stages, partial failures, column/date/currency/identity/formula validation, relationship conflict resolution, and cancellation. Sample discovery processes definitions, not rows. Current field mappings are user-controlled configuration, not proof of valid live data.
4. **Metrics and intelligence.** The app stores KPI calculation descriptions and targets. It does not evaluate arbitrary formulas or calculate performance. Add an audited calculation engine, source evidence, reporting-period handling, data freshness checks, and company/department permission enforcement in every analytics/AI read path. No AI endpoint is implemented.
5. **Production operations.** Managed persistent storage and migrations, encrypted backups, HTTPS, CSP/security review, centralized rate limiting, robust email quotas, distributed transaction/idempotency strategy, monitoring, full session management, account deletion/export, and legal documents. Current rate counters are process-local; SQLite targets one server process. There is no distributed job runner or operational alerting.
6. **Ownership and lifecycle.** Ownership cannot be granted via invitations or member updates, and Owners cannot leave through ordinary membership operations. Implement a separately verified ownership-transfer flow, account recovery, archive restore UI, retention policy, and protected permanent deletion. Archive currently retains data and hides the company; restoration requires administrative database intervention.
7. **Advanced collaboration.** Current Owners/Admins configure workspaces. Other roles receive conservative redaction of sources, mappings, goals, KPIs, and priorities. Viewers/Department Managers see only assigned department names. Add explicit per-field/per-insight policies before exposing actual sensitive business data. Editors receive a version conflict rather than an automatic merge when editing concurrently. Resending rotates an invitation token; no email is actually sent by the development adapter.
8. **Coverage expansion.** Live OAuth, mail-provider failures, real spreadsheet data quality, production performance, multi-instance behavior, assistive-technology review, and external security assessment require configured services and additional tests. Automated development tests do not certify those unimplemented capabilities.

## Configuration presently supported

| Name            | Purpose                                                            | Default                |
| --------------- | ------------------------------------------------------------------ | ---------------------- |
| `PORT`          | Node API / production HTTP port                                    | `3001`                 |
| `DATA_DIR`      | SQLite storage directory                                           | `.data`                |
| `NODE_ENV`      | Production cookie/static-server mode and development-delivery gate | development when unset |
| `CHROMIUM_PATH` | Installed Chromium path for browser tests                          | `/usr/bin/chromium`    |

No production OAuth/mail credentials are declared because those adapters are not implemented. Never enter secrets into chat, repository files, frontend storage, or saved setup instructions.

## Validation performed

The automated API suite exercises HTTP-only cookie sessions, idempotent creation, independent company IDs, cross-company denial, version conflicts, verified invitation identity, duplicate/revoked/reused invitations, scoped Viewer redaction, role escalation denial, last-owner protection, membership revocation, password reset/session invalidation, and archival.

Browser tests exercise signup-to-dashboard onboarding with refresh persistence, explicit sample integration behavior, mapping confirmation, KPIs/goals, mobile authentication, password visibility, recoverable Google configuration errors, invited-user registration context, additional companies, company switching, unsaved-change recovery, and mobile workspace overflow.

Production-mode tests verify SPA serving, disabled development delivery, request hardening headers, and malformed-URL recovery. They do not establish production readiness for the unimplemented services above.
