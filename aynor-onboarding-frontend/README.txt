AYNOR — Onboarding frontend

Open index.html directly in your browser. Application code,
styles and visuals are embedded. No backend or installation is required.

Start at Home, log in/create an account, or skip to explore as a guest.
Onboarding opens directly without a company-selection screen.
Verification code: 123456. Authentication and Google connections are simulated.

Seven onboarding steps:
1. Company details — name, industry, website, size, country and
   business model.
2. Departments — choose existing options or add custom departments.
3. Data sheets — connect Google Sheets, upload CSV/TSV/JSON (up to 5 MB),
   or paste a Google Sheets URL. Google/URL previews use example fields.
   Uploaded files are read locally; only column headers are retained.
4. Mapping — edit source fields and department assignments; optional.
5. Business priorities — existing and custom options; optional.
6. Goals — add and edit goals and descriptions inline; optional.
7. Review — full details and an edit link for each step, then open workspace.

Progress persists in this browser. No real email, OAuth, payment or network
integration is performed. Do not enter sensitive information in the preview.

Editable source: source/.
Development: cd source, npm ci, npm run dev.
Build: npm run build.
Browser checks with Vite running: npm run test:frontend.
Export: node src/export-html.mjs; copy generated aynor.html to ../index.html.

Font: Helvetica Neue, with Helvetica/Arial system fallbacks.
Backend services, databases and API/authentication configuration are unchanged.
