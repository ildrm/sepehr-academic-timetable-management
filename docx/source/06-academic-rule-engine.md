# Academic rule evaluation

DOC-06 · Version 0.1 · proposed · Owner: Academic policy owner

**Purpose and scope** — Evaluate a versioned eligibility expression against a proposed final state.

**Audience** — Policy authors, engineers and advisors.

**Dependencies** — [Academic domain and curriculum](05-academic-domain-curriculum.md), [Calendar and academic workflows](07-calendar-state-workflows.md), [Registration transactions](17-transactions-consistency.md).

## Rule authority and evaluation order
The restricted abstract syntax tree (AST) represents conditions as typed data. The schema permits Boolean AND, OR and bounded NOT over named facts. Compile before activation: enforce a node/depth budget, recognized course and parameter references, type compatibility, nonnegative thresholds and a declared scope. Reject unbound parameters and recursive exception grants. Evaluate in a pure function with explicit facts, stage, curriculum edition, policy version and decision time. No expression can call a service or execute administrator code.
| Rule | Scope and normative condition |
| --- | --- |
| BR-001 Entry evidence | Prior completion requires passed evidence at the policy grade threshold. Concurrent uses the final same-term set. In-progress requires an explicit provisional predicate. |
| BR-002 Final set | Compute active courses minus drops plus complete additions. Reject repeats disallowed by pinned policy, lost corequisites, conflicts or excess credits. Count each course once. |
| BR-003 Exceptions | Apply only approved, in-scope, unexpired, named grants. An authorized actor other than the requester must approve. Route corrected or failed provisional evidence to review. |
| BR-004 Deadline | Student must be within both appointment and operation window at the locked database decision instant [open, close). |
| BR-005 Scarcity | Honor queue order and reserve eligibility before a direct claim. Apply approved tiers and deterministic ties for the affected pool set. |
| BR-006 Components | Require exactly the permitted component pattern and one claim in each distinct physical pool. |
| BR-007 Credit floor | Check an approved minimum at explicit finalization and subsequent changes. Draft additions can start below the minimum. |
| BR-008 Degree recognition | Use pinned curriculum, effective directed equivalencies, approved repeat policy and an explicit allocation limit per completion. |
## Evidence, precedence and explanations
Use true, false and unknown for missing facts. AND is false if any child fails; OR is true when any child succeeds. NOT preserves unknown and operates on its declared child only. Unknown prerequisite evidence routes to review. Apply statutory or institutional non-waivable gates first, then the applicable program rule and an explicitly authorized grant for a named waivable predicate. Reject ambiguous overlapping policy scopes at activation.
A response includes decision, reason codes, evaluated rule IDs, policy version and localized explanation key. A passed A at or above PASS_A satisfies minimumGrade(A); in-progress A fails confirmed-completion, even if concurrent enrollment would be allowed elsewhere. A valid one-use transfer exception can produce exception with its grant reference. Return rejected for an over-ceiling final set without a grant. Never waive physical capacity.
For a hypothetical probation rule, select CEILING_PROBATION when the student's ratified standing is probation. A final-term grant may select FINAL_TERM_CEILING until its expiry. GPA uses the institution’s grade scale, repeated-attempt rule and decimal arithmetic. Course sharing and transfer limits come from the pinned curriculum.
## Decision examples for policy review
|Hypothetical facts|Decision and explanation|
|---|---|
|Both corequisites are in the same complete batch.|Accept when both concurrent predicates hold. Dropping only one later rejects the remaining course.|
|A prior course is still in progress at the decision instant.|Reject mandatory prior completion. An explicitly provisional admission opens a review when the result arrives.|
|A repeated attempt supersedes a failed grade.|Select attempts using REPEAT_SELECTION and GRADE_SCALE. Missing grade mappings return review, never an implicit pass.|
|Proposed credits exceed the probation ceiling.|Reject with ceiling reason; accept as exception only when an approved final-term grant covers this predicate and final total.|
|Course X was approved as Y for an earlier curriculum only.|Reject recognition outside the effective edition. The credit-transfer office may approve a new scoped mapping.|
|A shared completion could satisfy two exclusive groups.|Allocate it once. If an edition permits shared satisfaction, show the second satisfied group and count total earned credits once.|

## Feasibility of prerequisite chains
Use a graph to find candidate cycles, then evaluate alternatives and stage semantics. A requires B OR already-passed C, and B requires A, can be reachable through C. A and B as corequisites can be taken together. Compute a fixed point of reachable completions from admissible entry/transfer facts with concurrent bundles; identify unsatisfied alternatives and prohibited NOT branches. Escalate unbounded or ambiguous cases for academic review. A cycle alone is insufficient evidence to reject a curriculum.

## Decision and open question
Proposed: Validate restricted rules before activation and propagate unknown evidence explicitly. Assumed: Policy owners can express thresholds against typed academic facts.

Needs approval (RISK-001) — Thresholds, GPA scales, exception and sharing parameters. Academic senate delegate: Approve policy editions, samples and applicability.

## References
[academic rule.schema](../artifacts/schemas/academic-rule.schema.json) · [academic rule](../artifacts/examples/academic-rule.json)

[JSON Schema](https://json-schema.org/draft/2020-12)
