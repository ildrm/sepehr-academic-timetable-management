# API contracts and errors

DOC-16 · Version 0.1 · proposed · Owner: Backend lead

**Purpose and scope** — Use the REST contracts and resolve failures without duplicate writes.

**Audience** — Web, integration and test engineers.

**Dependencies** — [Product roles and permissions](04-user-roles-permissions.md), [Enrollment and waitlists](09-enrollment-waitlist.md), [Registration transactions](17-transactions-consistency.md).

## Transport contract
OpenAPI 3.1.1 defines the proposed same-origin browser boundary. Session derives self-service subject. Delegated changes use a separate staff resource with a subject in the URL and a required case reference. Nest.js maps the identifiers to the authorized organization and term. Opaque pagination cursors bind filters, actor scope and watermark; reject a cursor replayed under another scope. Sort by stable offering ID and accept only listed filters. The limit ceiling is a proposed API bound.
| ID and operation | Scoped resource |
| --- | --- |
| API-001 previewEnrollment | /me/enrollment-previews |
| API-002 enroll | /me/enrollments |
| API-003 drop | /me/drops |
| API-004 swap | /me/swaps |
| API-005 joinWaitlist | /me/waitlist-entries |
| API-006 respondToOffer | /me/waitlist-entries/{entryId}/responses |
| API-007 getRequestStatus | /me/requests/{operation}/{requestKey} |
| API-008 changeForStudent | /staff/students/{studentId}/enrollment-changes |
| API-009 startSolve | /terms/{termId}/solve-runs |
| API-010 getSolve | /terms/{termId}/solve-runs/{runId} |
| API-011 validateTimetable | /terms/{termId}/timetables/{versionId}/validations |
| API-012 publishTimetable | /terms/{termId}/timetables/{versionId}/publications |
| API-013 listOfferings | /me/offerings |
| API-014 finalizeRegistration | /me/registration-finalizations |
## Example exchange
A student with an authenticated session sends POST /me/enrollments with the session-bound CSRF header and a fresh opaque Idempotency-Key. All identifiers below are synthetic.
```json
{"termId":"T","bundles":[{"sectionId":"SEC-A","componentIds":["LEC-A","LAB-A"]}]}
```
If the linked laboratory is full, the 409 envelope includes code ERR-005, messageKey capacity_conflict, an opaque requestId and details limited to the caller’s affected bundle. The transaction preserves the old academic set. The same key and payload recovers that refusal. A later, deliberately different choice receives a fresh key.

## Submission and recovery
Send an enrollment with termId, bundles and an Idempotency-Key. Each bundle identifies one section and every required component. Preview returns decision, policyVersion, evaluatedRules, reasons and explanationKey, with no seat claim. A successful commit returns requestId, outcome, resourceId and revision. Retrieve GET /me/requests/{operation}/{requestKey} after an ambiguous disconnect. Finished results carry the original HTTP status; in-flight claims may block until visible or appear absent before commit. Retry the same key and content if unresolved.
For scope failures prefer 403 or an opaque 404 where existence is sensitive. Invalid structure is 400. A rule rejection is 422 and unavailable capacity is 409. Return one stable primary code, message key, request ID and a list of safe rule-level details. Sort blocking reasons by fixed precedence: authorization, window, academic rules, then seats. Do not reveal competing identities, grades or internal SQL errors. The YAML includes concrete success and error payloads.

## Decision and open question
Proposed: Scope command keys to actor and operation. Assumed: Client callers can persist one opaque key per intent.

Needs approval (RISK-010) — Data stewardship and maker/checker delegations. Security lead: Test cross-scope grants and independent approval.

## References
[openapi](../artifacts/openapi.yaml) · [error catalog](../artifacts/error-catalog.yaml)

[OpenAPI Specification](https://spec.openapis.org/oas/v3.1.1.html)
