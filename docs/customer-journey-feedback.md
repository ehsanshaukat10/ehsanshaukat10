# Customer journey feedback — implementation and verification

The hosted implementation now separates connection from mapping. Existing authentication and old financial API contracts remain supported. No new database migration or environment variable is required.

## Signup and recovery

- The verification screen's **Check verification** action checks the native session. An unverified user remains on that screen; the action never pretends that clicking a button proves ownership.
- Supabase verification callback tokens are validated against the provider's `/auth/v1/user` endpoint. Only a confirmed email can provision an AYNOR identity and receive an HttpOnly Secure session. A valid callback shows a success toast and opens the saved onboarding destination directly, without asking for credentials again.
- Untrusted/expired tokens cannot sign in. Tokens are held only in memory and stripped from the browser URL before the exchange. A fresh link can be opened while an old expired-link screen is still open.
- The verification screen detects a completed confirmation in another tab using the shared native session. Verification on a different device requires sign-in; no email-only session can be issued.
- Login includes Forgot password. Recovery uses Supabase email delivery. The existing allowed `/auth/confirmed` callback also handles recovery links, then routes internally to the password form. No additional redirect allowlist entry is required. Reset requires valid provider proof, matching passwords in the UI, a 10–200 character new password, one-use reset proof enforcement, and native-session revocation. Expired reset links offer a new-link action.
- Supabase sender/SMTP, confirmation settings, valid site URL and approved Google test users remain deployment requirements. Recovery also supports legacy manually provisioned operators: the server creates an unconfirmed provider identity if needed, sends the recovery email and requires provider-verified email ownership before updating the existing native password. It never marks that newly created provider identity confirmed itself. Existing operator IDs, memberships and normal password sign-in remain intact.

## Connect sources (step 3)

- The Google card shows the connected account identity, separate from workbook/source cards. New consent asks only for spreadsheet read access plus standard OpenID/email identity scopes. Older grants can show “Google account connected” until reconnected once to grant email identity. No spreadsheet access is broadened.
- File discovery is attempted after consent. A grant that permits Drive metadata listing can supply a picker; spreadsheet-read-only grants normally cannot list Drive files. In that case the spreadsheet-link input is shown **after** Google connects. No broad Drive permission is silently requested.
- Excel/CSV uploads retain every worksheet, and shared URLs add their linked worksheet. A published CSV is a single worksheet, so use Google or Excel to discover all pages.
- Each source is additive. Google, uploads and shared URLs can coexist; connecting or deleting one does not disconnect the others. Up to 10 sources can be saved. Uploaded workbook cells are retained server-side, within the existing 3 MB snapshot budget, so other pages can be mapped later without another upload. Original uploaded files are not separately retained. Owner/Admin source permissions are unchanged.
- Connecting a workbook does not map it. Step 3 shows pending/mapped coverage and Continue opens step 4. Google account credentials can be changed without deleting saved reports.

## Map worksheet pages (step 4 and company Data connections)

- Every discovered page stays visible under its parent workbook. Each page shows mapped/skipped/pending status, department, record count, errors and last check.
- The former “How would you like to use this data?” and “What is this table about?” controls are removed. A page is assigned to an actual workspace department. Its columns receive editable properties: Text, Number, Currency, Percentage, Date, Yes/No, optional Money in/Money out, or Don't import.
- Financial reporting is produced only when Date, Money in and Money out are explicitly assigned. Other tables remain searchable nonfinancial data with category/completeness charts; numeric IDs are not financial metrics.
- The table-range accordion is removed from this flow. Preview and help are portalled dialogs above the whole canvas. A header-row correction remains inside Preview, for sheets with title/cover rows.
- Date parsing supports year/day/month order choices, slash/dash/dot separators, valid ISO date-times, and an explicit Excel-serial choice. Ambiguous day/month order is never guessed. Source-row errors use physical worksheet row numbers, including skipped blank rows.
- Multiple selected pages in a workbook are validated together; all page-specific failures are returned. A failed group leaves its previous mappings/data intact. Successful mappings stay on step 4; there is no redundant data-check screen or redirect back to Connect Google.
- Unmapped pages can be skipped or mapped later from company settings, using the saved parent workbook. Users do not need to paste the same link again. Reconnecting the same workbook deduplicates by source method and identifier, preserves mapped pages and discovers new pages.

## Sync and Overview

- Source operations use the existing database lease and atomic snapshot-publish function. Source edits are serialized; an active sync cannot be overwritten by a concurrent change. Catalog edits do not delete snapshots or use the legacy reset operation.
- Sync now works on each remote source and checks all its mapped pages. It also discovers new Google pages. Per-page failures preserve the last good page while allowing other pages to refresh. Removed Google pages remain visible with their saved data and an explanatory error.
- Successful checks show timestamps and added/changed/removed row counts (changes compare row positions, not business entity identities). No-change checks are labelled. Uploaded workbooks use Upload new version instead of a fake network sync; same-name replacement refreshes valid mapped pages and preserves failed pages' last data.
- Overview keeps its last data visible while sync/refresh is in progress. Table tabs identify the parent workbook and department. Coverage explicitly states how many pages are mapped and links to remaining pages. Source data is not combined into invented cross-source financial totals.
- Legacy financial snapshots and confirmed table links are adopted without deleting their data. Older file imports that never retained raw worksheet cells may require the original file once to edit their mapping or discover other pages. Their current report remains visible.

## Checks

`node --test --test-concurrency=1 tests/*.test.js` covers verified callbacks, reset proof/session revocation, mixed connection methods, whole-workbook persistence, complete multi-page validation errors, date formats, legacy adoption, retained data during active sync, concurrent-edit rejection and scoped-role denial, plus the existing API suites.

`npm run test:serverless` runs six updated browser journeys: shared URL; Google identity/consent/sync; simultaneous methods and independent removal; multi-page Excel with preview/help/remaining-page mapping; signup/automatic verified entry/recovery/logout/isolation; and the complete company onboarding-to-dashboard journey including explicit skipped-data states. Provider operations are controlled fixtures; they do not certify a particular live Google or SMTP configuration.
