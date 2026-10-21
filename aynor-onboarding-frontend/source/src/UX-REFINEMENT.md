# Onboarding UX audit and refinement

The existing authentication composition, Geist typography, color palette, cards, input controls, rounded corners, and responsive visual identity are retained. Layout changes are limited to the guided onboarding sequence.

| Existing screen or pattern                                                    | Revised behavior                                                                                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Default 23-screen gallery                                                     | Application and HTML start with authentication; the catalog is a separate design-review route.                                         |
| Signup, login, verification, recovery                                         | Retained. Successful authentication resolves account/company/invitation state.                                                         |
| New user directly entering company setup                                      | A short onboarding welcome follows authentication.                                                                                     |
| Company identity                                                              | Step 1. Name, industry, country; currency/timezone are defaulted under Preferences. Website and size move to company settings.         |
| Departments                                                                   | Step 2. Lightweight selection and custom departments. Renaming/reordering remain in workspace settings.                                |
| Business priorities                                                           | Optional workspace checklist item.                                                                                                     |
| Google connection and spreadsheet selection                                   | Combined into Step 3. Consent, selection, denied-access retry, and optional skipping remain.                                           |
| Discovery, mapping, readiness                                                 | No mandatory wizard screens. Ambiguity is disclosed only when relevant; advanced review remains in workspace settings.                 |
| KPIs and goals                                                                | Optional workspace checklist items with existing editors.                                                                              |
| Invite collaborators                                                          | Step 4. One primary action; partial results retained, successful invitations never resent on retry, and skip is available.             |
| Setup review and separate completion page                                     | Combined into Step 5. Four essential summary rows and Finish setup, then workspace.                                                    |
| 12-step sidebar and preview navigator                                         | Removed from onboarding. Five-stage progress replaces them. Only completed/skipped prerequisites unlock later stages.                  |
| Repeated notes, role explanations, save/finish-later strips, next-step panels | Removed from the guided wizard. Contextual notes appear only when relevant.                                                            |
| Workspace management                                                          | Multi-company selection/switching, invitations, member permissions, profiles, and advanced configuration remain available after entry. |

Drafts survive Back and refresh. Company creation retains an idempotency key and partially created-company context until setup progress is saved. Single-company completed users enter their workspace; incomplete users receive Resume setup. Multiple-company users and pending invitations use the selector when appropriate. Invited users never have to create a company.

This refinement changes frontend files and browser-local prototype behavior only. No backend services, API configuration, database files, or production infrastructure were modified.
