# Next.js frontend and user experience

DOC-14 · Version 0.1 · proposed · Owner: Frontend lead

**Purpose and scope** — Guide each role through authoritative, recoverable interactions.

**Audience** — Interaction designers and web engineers.

**Dependencies** — [Product roles and permissions](04-user-roles-permissions.md), [API contracts and errors](16-api-contracts-errors.md), [Persian interface, accessibility and time](26-i18n-accessibility-time.md).

## Rendering and session boundary
Server Components load authorized term, curriculum and schedule views through the API client. Client Components own basket edits, accessible dialogs, focus and recovery polling. Server Actions and Route Handlers verify a session-bound CSRF token and origin, then call Nest.js with authenticated actor context. Nest.js repeats scope and academic checks. The BFF holds upstream credentials server-side and never writes academic tables.
Allow shared caching only for published public catalog metadata keyed by edition and locale. Mark personal views, session status and commit responses private and no-store. Capacity reads carry an as-of timestamp; refetch at confirmation. On expiry, retain a minimal opaque request key, require login and retrieve status under the same identity. Clear local personal data on sign-out or identity change.

## Screen contracts
| Screen and role | Inputs and actions | User-visible state |
| --- | --- | --- |
| Offering list / student | term and department; search, choose section (PERM-022) | Loading term → no offerings or scoped results; retry failed fetch. Capacity is dated. |
| Basket and receipt / student | complete bundle; preview (PERM-022), confirm (PERM-001), recover (PERM-023) | Empty basket → preview reasons → pending → receipt or corrective message. |
| Waitlist / student | bundle or offer reference; join, accept, decline (PERM-017) | No entry → submitted → queued or offered → enrolled, expired or declined. Refetch on error. |
| Progress / advisor | assigned advisee and edition; review groups (PERM-005) | Load facts → no completions or explained allocations. Pending record corrections are marked. |
| Availability / instructor | term, intervals and exceptions; submit (PERM-003) | Empty draft → preview → saving → dated confirmation; retain draft after validation errors. |
| Planning / planner | snapshot, pins or manual edits; run and validate (PERM-009, PERM-021) | No candidate → running → candidate or diagnostics. A stale candidate stays visible with a refresh action. |
| Policy and exceptions / academic office | edition or case; request or approve using separate grants (PERM-018, PERM-012) | No requests → submitted → awaiting sign-off → approved/rejected; show conflicts and expiry. |
| Report center / academic office | term, scope, filters; request export (PERM-020) | Empty watermark → pending job → scoped download or failure with reference. |
The approval screen presents a draft author, scope, changes and supporting evidence to the designated independent approver. The publication action stays pending through validation; a stale hash returns to candidate review. A rejected approval preserves the prior published version and gives a dated reason.

## Interaction feedback
Loading states preserve headings and announce progress. Empty states identify the missing input or records. Errors attach localized text to the affected field and expose a request ID for support. Pending means a submission is being checked or has an unknown outcome. Only a confirmed receipt can move an enrollment action into its success state. For a sticky error, keep keyboard focus on the first actionable explanation; preserve the selected bundle for correction.

## Decision and open question
Proposed: Recover uncertain changes by request status before showing success. Assumed: The identity provider supports an authenticated web session.

Needs approval (RISK-010) — Data stewardship and maker/checker delegations. Security lead: Test cross-scope grants and independent approval.

## References
[openapi](../artifacts/openapi.yaml) · [permission matrix](../artifacts/permission-matrix.csv)

[Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
