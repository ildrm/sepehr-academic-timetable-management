# Scoped, time-bounded assignments

ADR-011 · Version 0.1 · proposed · Owner: Security lead

**Purpose and scope** — Decide how to address the following design pressure. People can hold several academic or technical roles across units and terms.

**Audience** — Security lead, implementation leads and quality reviewers.

**Dependencies** — [Product roles and permissions](../04-user-roles-permissions.md), [Security and privacy](../19-security-privacy-threat-model.md).

## Alternatives and decision
One global role cannot express an advisor relationship or expiring appointment. Client-only filtering exposes records.

Evaluate assignments, action, scope, relationship, state and validity at the API; separate requestor and approver.

## Rationale and consequences
Academic authority follows delegated institutional responsibility. Review staff grants, negative tests and audit actor/subject separately.

## Risks, assumptions and open question
A stale relationship can disclose another student’s record. Assumed: Record relationships can be resolved from authoritative assignments.

## Reconsideration trigger
Revisit when delegation, cross-institution access or sensitive extension workflows change. The security lead owns review and approval.

## References
[Product roles and permissions](../04-user-roles-permissions.md), [Security and privacy](../19-security-privacy-threat-model.md).
