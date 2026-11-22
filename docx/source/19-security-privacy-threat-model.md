# Security and privacy

DOC-19 · Version 0.1 · proposed · Owner: Security lead

**Purpose and scope** — Protect records and decision authority across trust boundaries.

**Audience** — Security reviewers, registrar and operations.

**Dependencies** — [Product roles and permissions](04-user-roles-permissions.md), [System architecture](12-system-architecture.md), [Observability and academic reports](23-observability-reporting.md).

## Assets and trust crossings
Protect student identity, academic attempts, exception evidence, queue position, schedules and export files. The browser, BFF, API, worker, solver and external identity provider have different privileges. Terminate TLS at a managed boundary and authenticate service-to-service calls. The API derives scope from verified identity and applies record-level permissions at read, export and mutation. Privileged academic work requires strong authentication, recent reauthentication and time-bounded assignments.
|Threat at boundary|Proposed control|Verification|
|---|---|---|
|Another student’s record or cohort export|Bind query scope to subject or mandate; recheck grants at download.|Exercise negative cross-faculty, section, term and advisee cases.|
|Policy edits, bypassed appointments or quota manipulation|Separate author and approver; enforce locked calendar and capacity guards.|Compare denial, audit actor and decision time.|
|Request replay and stolen sessions|Short-lived, rotated server sessions, Secure/HttpOnly cookies, SameSite policy, CSRF token and Origin validation.|Retry same key and different payload; revoke a session and test read and write.|
|Script or query injection|Contextual output encoding, content security policy, parameterized queries, restricted AST and field allowlists.|Review rendering and SQL bindings; reject unknown fields.|
|Bulk extraction or privilege escalation|Explicit CORS origin allowlist, scoped rate limits, export entitlement, finite downloads and privileged-access review.|Check that enumeration and export routes enforce equivalent scope.|
## Data handling
Operational logs contain request ID, duration and coarse failure class. Academic audit records include actor and subject IDs plus policy references under restricted access. Events contain opaque IDs and revision; a consumer fetches permitted detail. Personal responses use no shared cache. Exports are encrypted, scoped at creation and download, expire after EXPORT_TTL and record access. Backups contain sensitive originals, requiring encrypted isolated storage, limited restore access and lifecycle controls. Test and benchmark environments use synthetic data.
Privacy owner classifies identifiers, contact data, grades and accommodation needs with counsel. Set retention per store, legal holds, subject access and deletion/anonymization procedures before launch. A deletion ledger reapplies approved redactions after restore. Rotate secrets through a manager, scope service accounts and audit emergency access. Security and policy review are still required.

## Decision and open question
Proposed: Apply scope checks on both report creation and download. Assumed: The institution will identify a privacy and security review owner.

Needs approval (RISK-004) — Retention and access delegation. Privacy officer: Approve class-specific schedule and role review.

## References
[permission matrix](../artifacts/permission-matrix.csv) · [risks assumptions decisions](../artifacts/risks-assumptions-decisions.csv)

[Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
