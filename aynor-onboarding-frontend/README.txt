AYNOR — Onboarding frontend

Open index.html in your browser. Everything is included in this standalone file.
Start at Home, choose Log in or Create account, or Skip for now to explore as a guest.

The uploaded detailed onboarding is retained: company, departments, priorities,
Google Sheets connection, sources, discovery, mapping, readiness, KPIs, goals,
invitations, review and completion. Onboarding has a clean form on the left
and an original visual on the right, with no sidebar. Mobile focuses on the form.
The workspace dashboard retains its existing navigation.

All accounts, invitations and integrations are simulated locally. Verification
code: 123456. No real emails, account creation or Google connections occur.
Progress and drafts are stored in this browser. Do not enter sensitive data.

Editable React/TypeScript source: source/.
Development: cd source, npm ci, npm run dev.
Build: npm run build.
Browser checks, with Vite running: npm run test:frontend.
Regenerate standalone HTML: node src/export-html.mjs
Then copy source/aynor.html to this folder as index.html.

No backend, database, authentication service or API configuration changes.
