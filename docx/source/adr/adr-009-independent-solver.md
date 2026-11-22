# Solver as a proposal producer

ADR-009 · Version 0.1 · proposed · Owner: Planning lead

**Purpose and scope** — Decide how to address the following design pressure. Timetabling is computationally distinct and can consume stale inputs.

**Audience** — Planning lead, implementation leads and quality reviewers.

**Dependencies** — [Timetabling optimization](../10-timetabling-optimization.md), [System architecture](../12-system-architecture.md).

## Alternatives and decision
Embedding a search in the request path holds resources. Direct solver publication bypasses independent academic review.

Use a separate Python OR-Tools CP-SAT process with immutable inputs and a versioned output contract.

## Rationale and consequences
Manual and generated proposals can use one independent publication validator. Record build, seed, configuration, domain exclusions and candidate evidence.

## Risks, assumptions and open question
A feasible result may still encode stale source data. Assumed: Planning inputs can be frozen and hashed per run.

## Reconsideration trigger
Revisit the solver algorithm after benchmarks on representative data and an independent correctness comparison. The planning lead owns review and approval.

## References
[Timetabling optimization](../10-timetabling-optimization.md), [System architecture](../12-system-architecture.md).
