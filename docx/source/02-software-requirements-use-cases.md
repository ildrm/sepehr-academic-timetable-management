# Requirements and use cases

DOC-02 · Version 0.1 · proposed · Owner: Business analyst

**Purpose and scope** — Translate student and staff intentions into observable outcomes.

**Audience** — Engineers and acceptance testers.

**Dependencies** — [Product roles and permissions](04-user-roles-permissions.md), [Academic rule evaluation](06-academic-rule-engine.md), [API contracts and errors](16-api-contracts-errors.md), [Registration transactions](17-transactions-consistency.md).

## Use case specifications
The cases below use the target from the authenticated session for self-service. Each alternative that changes academic state enters the same transaction path. A receipt identifies a committed command. A preview returns reasons and makes no writes to enrollment.

### UC-001 · Confirm one or more bundles
Student initiates this when open appointment, valid session, published sections. Input: term and complete bundles. Permission: PERM-001. Contract: API-002.

Success and effects: validate final set, acquire all claims and issue receipt. Alternative and errors: missing prerequisite produces reason; full lab rejects entire bundle (ERR-004 / ERR-005). Acceptance: TEST-001 / TEST-003.

### UC-002 · Request replacement
Student initiates this when owned active original and valid window. Input: old enrollment IDs plus new bundles. Permission: PERM-001. Contract: API-004.

Success and effects: replace both legs in one commit and store receipt. Alternative and errors: replacement unavailable leaves original and its claims untouched (ERR-005). Acceptance: TEST-006.

### UC-003 · Confirm removal
Student initiates this when owned active records. Input: term and enrollment IDs. Permission: PERM-001. Contract: API-003.

Success and effects: check remaining courses, release all removed claims, issue receipt. Alternative and errors: a stranded corequisite blocks all removals (ERR-004). Acceptance: TEST-007.

### UC-004 · Queue for a bundle or accept an offer
Student initiates this when published bundle or owned offered entry. Input: bundle or response and entry reference. Permission: PERM-017. Contract: API-005 / API-006.

Success and effects: persist priority, or convert all holds to active enrollment and return receipt. Alternative and errors: expired offer releases holds; changed eligibility triggers reasons (ERR-013 / ERR-004). Acceptance: TEST-009 / TEST-010.

### UC-005 · Request solver run
Timetable planner initiates this when scoped immutable input ready. Input: snapshot and configuration IDs. Permission: PERM-021. Contract: API-009 / API-010.

Success and effects: persist job plus outbox and return run ID; inspect terminal report. Alternative and errors: invalid or empty domains produce diagnostics and no publication (ERR-001). Acceptance: TEST-013 / TEST-034.

### UC-006 · Publish timetable
Academic administrator initiates this when validated hash, current epoch and independent approver. Input: term, version, hash and validation reference. Permission: PERM-011. Contract: API-012.

Success and effects: supersede previous publication, append audit and event, return receipt. Alternative and errors: stale input retains current publication (ERR-008 / ERR-003). Acceptance: TEST-012.

### UC-007 · Correct a student registration for an authorized case
Academic-office staff initiates this when valid faculty/term delegation and case relationship. Input: explicit subject, case, adds and drops. Permission: PERM-007. Contract: API-008.

Success and effects: standard final-set transaction records actor and subject. Alternative and errors: out-of-scope student yields denial without record details (ERR-003). Acceptance: TEST-017.

## Conditions that must remain observable
Given a swap with a full replacement, when the student confirms, then the original enrollment and claims remain and the response identifies the unavailable bundle. Given a decision at the closing instant, when the student retries a previously uncommitted intent, then the server checks the new decision time. A replay of a finished key returns the original outcome even after closing. See TEST-006 and TEST-011.

## Decision and open question
Proposed: Use one all-or-nothing outcome per student change command. Assumed: An authenticated subject is available at the API boundary.

Needs approval (RISK-007) — Final-set minimum-credit enforcement stage. Registrar: Approve draft, finalization and late-change rules.

## References
[openapi](../artifacts/openapi.yaml) · [test scenarios](../artifacts/test-scenarios.yaml)
