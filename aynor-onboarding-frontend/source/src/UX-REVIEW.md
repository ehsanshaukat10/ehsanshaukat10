# AYNOR UI/UX review

Reviewed the landing page and 18 application screens, with desktop/mobile layout checks and the functional onboarding suite. The changes refine typography without compressing the established whitespace or changing backend behavior.

## Findings and changes

| Area | Screens reviewed | Result |
| --- | --- | --- |
| Landing | Hero, features, process, pricing, FAQs and footer | New headline: “See clearly. Lead confidently.” Signup is the primary navigation/hero entry. Existing editorial headings and section spacing remain. |
| Authentication | Signup, login, verification, recovery and reset | Standardized labels and action text; desktop inputs use 14px. Signup is the default `/auth` entry and public protected-route destination. Explicit login and recovery links remain. |
| Company setup | Creation and profile editing | Consistent regular-weight labels and input text, paired fields, existing spacing retained. Website entry still accepts a bare domain. |
| Company management | Company list and workspace overview | Control typography follows the shared scale, with primary headings remaining prominent. |
| Departments | Standard and custom selections | Quiet 13px regular labels; input/button alignment retained. |
| Connection and mapping | Sheets/file/URL, consent dialog and field mapping | Shared input/action scale. Full-viewport consent overlay and field-by-field mapping remain functional. |
| Priorities and goals | Standard/custom priorities, inline goal editing and description | Smaller control typography and accessible descriptions, without reducing whitespace around the forms. |
| Review and completion | Flat review sections, edit links, expanded details and completion | Hierarchy remains heading-led; compact metadata, regular actions and the restrained completion design remain. |
| Collaboration | Invitation acceptance and members/permissions | Fixed mobile navigation overflow and allowed long member details to wrap safely. |

## Type hierarchy

- Main headings retain their editorial scale.
- Desktop input text: 14px, regular.
- Mobile and coarse-pointer input text: 16px, regular, to avoid mobile input zoom.
- Field labels and action text: 13px, regular.
- Field supporting hints: 12px with sufficient separation from labels.
- Placeholder colors are darker for readability.

A final typography stylesheet resolves conflicting sizes left by earlier component styles. Existing form padding, card spacing and button geometry are preserved.

## Validation

Page-by-page checks cover the 18 application screens at 1440px and 390px widths: control typography, headings rendering, page errors and horizontal overflow. The functional suite covers onboarding, uploads, mappings, goal editing, review edits, old routes, direct entry, persistence and auth viewport fit. Landing signup routing is checked separately.

The review targets the implemented frontend and local mock journeys. No backend, API/auth configuration, database or production integration changes are included.
