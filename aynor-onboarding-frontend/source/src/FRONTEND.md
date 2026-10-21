# AYNOR — refined frontend onboarding

## Run

From `aynor-onboarding-frontend/source`:

```sh
npm ci
npm run dev
```

Or open `aynor-onboarding-frontend/index.html` directly for the self-contained prototype. Authentication is the default entry. The existing split-screen authentication design, fonts, palette, cards, and controls are preserved.

## Current journey

Signup/login → verification when needed → onboarding welcome → **Company → Structure → Connect Data → Invite Team → Finish** → workspace.

- Company creation asks for company name, industry, and country. Currency/timezone default intelligently and can be changed under Preferences. Website and size remain editable in company settings.
- Structure uses the existing lightweight department selection tiles and custom department field.
- Connect Data combines simulated Google consent and spreadsheet selection. Ambiguous data can be reviewed progressively; full discovery, mapping, and readiness belong in workspace settings.
- Invite Team reuses multi-invitation rows, company roles, and department scopes. Its sole primary action sends invitations and proceeds. Skip is available. Pending invitations remain manageable later.
- Finish shows only company, department, source, and invitation essentials, with edit actions and one Finish setup CTA. Separate review/completion pages and repeated next-step panels are removed from the guided journey.
- The wizard has no sidebar, preview navigator, secondary menu, promotional bottom panels, or duplicate primary navigation.
- Completed steps can be revisited. Future steps are gated by actual completed/skipped prerequisites. Back saves data. Drafts survive refresh; incomplete companies offer Resume setup. Company creation uses an idempotency key and retains partially created company context for recovery.

## Post-onboarding configuration

The workspace’s **Workspace settings** checklist contains priorities, data connections, field mappings, KPIs, and goals. These are optional and independently editable. Existing advanced controls, discovery, readiness, and company profile editing are preserved under `/companies/:id/settings/setup/:step`; they are no longer sequential onboarding requirements.

Single-company users with completed setup go directly to their workspace. Incomplete users get Resume setup or Open workspace. Multiple-company users and users with pending invitations see company selection when appropriate. Invited users retain invitation context through authentication and never need to create a company to accept an invitation.

## Prototype boundaries

All responses are browser-local mock interactions in `src/lib/mockService.ts`. No backend requests, real authentication, emails, Google OAuth, or live company analysis run. Passwords are discarded. Prototype company state uses localStorage; local drafts and the selected persona use sessionStorage. No backend files, databases, or infrastructure are changed by this refinement.

## Validate and export

```sh
npm run build
PROTOTYPE_URL=http://127.0.0.1:5173 npm run test:frontend
node src/export-html.mjs
```

The browser suite uses installed Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). It verifies authentication-first entry, the complete five-step journey, error recovery, invitation sending, company/draft refresh persistence, gated future steps, Back, resume, skipping, completed-user routing, advanced settings, mobile overflow, and zero backend requests. Default test URL is port 5173; set `PROTOTYPE_URL` to the running frontend URL.

Export produces `source/aynor.html`; copy it to `aynor-onboarding-frontend/index.html` for distribution. The optional `/prototype` design catalog remains available separately for reviewing older screen designs; it is not the application entry or a second navigation system in onboarding.
