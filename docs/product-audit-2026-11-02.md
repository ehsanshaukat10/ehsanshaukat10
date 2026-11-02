# AYNOR integrated product audit — 2 November 2026

Audited product build: `0276ce8`. **Not ready for broad commercial rollout.**

- [Executive report and correction sequence](/workspace/artifacts/product-audit/REPORT.md)
- [Single prioritized issue register](/workspace/artifacts/product-audit/issue-register.md) · [CSV](/workspace/artifacts/product-audit/issue-register.csv)
- [Screenshots](/workspace/artifacts/product-audit/screenshots.md)
- [Business-source validation](/workspace/artifacts/product-audit/business-validation.md)
- [Coverage and explicit limitations](/workspace/artifacts/product-audit/coverage.md)

The register contains seven confirmed defects, four usability concerns, three product gaps and three untested external scenarios. The high-impact customer paths include onboarding goals absent from Goals, hosted invitations returning 503, API-only governed grant setup, dangling worksheet departments after department removal, and ineffective dashboard preferences.

Fourteen validated metric instances across all ten supported families matched the synthetic source records. The 117-test suite and full integrated browser regression suite passed, but the reproduced product defects remain. No real model calls were made. Production DNS failed in the audit environment; real email/Google/OpenRouter acceptance and exhaustive control permutations are not claimed.

No product-code, design-system, production migration or deployment changes were made during the audit. Audit-only scripts and synthetic artifacts are outside the repository. Stop for approval before corrections or further milestones.
