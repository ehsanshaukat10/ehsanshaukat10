# Session, onboarding and sheet-sync stabilization

Implemented locally for review. No deployment, production migration, design-system CSS change or Milestone 4F work.

## Feedback addressed

1. Completed companies route to Overview even when the saved step or login bookmark still points to Step 3. A completed final review also counts as completion for entry routing. Genuinely unfinished setup still resumes its saved step; source import alone does not falsely complete onboarding. Removed the premature dashboard shortcut from onboarding preparation cards.
2. Server sessions use persistent HttpOnly/Secure/SameSite cookies with a 30-day expiry and daily rolling renewal during activity. Existing shorter valid sessions renew on use. Renewal uses compare-and-set and cannot recreate a revoked/deleted row. Logout, password reset, expired sessions and verification requirements remain enforced. Clear the bootstrap session promise when identity changes to prevent restoring stale unauthenticated state after an App remount.
3. Login with multiple accessible companies opens the existing company selector instead of silently favoring an unfinished company. Explicit invitation links retain their invitation workflow.
4. Step 3 shows connected workbooks; worksheet statuses, parent-department controls and editing stay in Step 4. Automatic preparation may still run after import, but it never skips the Mapping step. Mapping shows prepared/unmapped pages and review/edit options.
5. One inline import result replaces overlapping toast/readiness messages during Step 3. Once a source is connected, the large add form collapses behind the existing Add workbook control, leaving the source and Continue action visible. More workbooks can be added without disconnecting prior ones.
6. In Connect Google, optional mapping-AI copy/consent appears only after an account is connected. Upload and shared-URL methods show the relevant opt-in when selected; they do not require a Google account.
7. The repeated data-ready card is omitted from Step 3. Existing management/review functionality remains available in Mapping and Data Connections.
8. Workbook department assignment reaches mapped and unmapped pages and updates any open draft for that workbook. Preparation answers fall back to the parent's department. Explicit worksheet overrides remain supported through editing.
9. Authorized Owner/Admin active workspaces automatically refresh due online Google/shared sources. Visible, online clients check every minute, process one due workbook per heartbeat and rotate by oldest check. Server-side permission checks, leases and a 60-second cooldown apply. Editing/onboarding, hidden tabs and offline clients do not run active sync. There is **no unattended server scheduler**: refresh requires an eligible workspace to remain open. Uploaded files require a new version.
10. Sync feedback names changed worksheet pages and retains date/time/timezone. Each page shows added/changed/removed counts and expandable changed row positions/column names (first 20 changed positions). Failures retain saved data and expose an error; failed pages do not label old changes as newly synced. Existing reporting refreshes after successful automatic sync through the same authorized service.

## Important limits

Change detection compares normalized imported row positions, not inferred business identities. Insertions/reorders can consequently appear as changed positions; the UI states this explicitly. Added/removed rows have counts, not inferred entity change histories. Only the latest check is retained; no new audit-history system or raw-cell value logging was introduced. Source schema changes and invalid values continue to require review instead of silently remapping.

A 30-day inactivity limit is intentional; logout/security revocation, expired sessions, browser cookie deletion and private-browser behavior still require sign-in. Incomplete workspaces are not silently marked complete just because they contain data. No existing production completion flags were altered.

## Verification

- Automated regression suite: 117 passing tests, including exact existing metric/permission behavior; persistent login across application reconstruction; daily renewal; password-reset revocation; multi-company entry and obsolete onboarding bookmarks; workbook-level department propagation; server sync cooldown and changed-column details.
- TypeScript build check passes. Existing CSS asset remains `index-dH7GHMWQ.css`.
- Browser acceptance checks a fresh browser context with the persistent session cookie, company selection even with a deep login return, Step 3/4 separation, one import result, absent pre-connection AI text, parent department in the worksheet editor, automatic source refresh, named changes, and desktop/mobile overflow.
- `npm run test:serverless` passed in full. The browser regression suite verifies ingestion, authentication, mapping, Overview, Departments, Actions, Dependencies, Goals, Ask, permission scopes and evidence navigation using synthetic local providers.

Screenshots and test logs: `/workspace/artifacts/session-connections/README.md`.

Reviewable implementation commits: `4e33bf0` (sessions/company entry) and `9748c3d` (connection/mapping flow, inheritance, active sync and regression coverage). No database schema change is required. Existing production session cookies renew on their next eligible request after an approved deployment.
