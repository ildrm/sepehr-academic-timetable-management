# Delivery roadmap and backlog

DOC-30 · Version 0.1 · proposed · Owner: Delivery lead

**Purpose and scope** — Sequence implementation around design dependencies and acceptance evidence.

**Audience** — Product, engineering and academic leadership.

**Dependencies** — [Product requirements](01-product-requirements.md), [Test and verification strategy](21-test-verification-strategy.md), [Risks and open decisions](32-risks-assumptions-open-decisions.md), [Traceability and delivery gates](33-quality-review-traceability.md).

## Dependency-led delivery
Size denotes relative uncertainty and breadth: S is bounded to one module, M crosses an interface, L spans consistency, migration or independent validation. Re-estimate after inspecting policy material, data extracts and staffing. Each phase below has a demonstrable story and an exit test. Queue and allocation fairness need institutional review before operational use.
| Phase and relative size | Story | Evidence and owner |
| --- | --- | --- |
| A • Foundation, M | FR-001 / FR-002. As a registrar, assign a student to an effective curriculum. | Depends on academic definitions. Deliver mapping and assignment editor. Registrar verifies stable edition, TEST-018/032. |
| B • Decisions, L | FR-003 / FR-004. As an advisor, explain a prerequisite rejection. | After A. Deliver rule AST and calendar contracts. Backend lead verifies evidence and closing boundary, TEST-011/019. |
| C • Transaction core, L | FR-006 / FR-007 / FR-015. As a student, swap a complete bundle safely. | After B and offering data. Deliver ledger and receipt lookup. Database reviewer verifies last-seat race, swap and disconnect, TEST-001/005/006. |
| D • Timetable, L | FR-005 / FR-010 / FR-011. As a planner, publish a validated candidate. | After A and resource inventory. Deliver manual validator and then solver adapter. Planning lead checks pins/freshness, TEST-012/021. |
| E • Allocation, L | FR-008 / FR-012 / FR-013. As a registrar, explain a scarce-seat outcome. | After C and D. Deliver protected offers and cohort report. Registrar validates ordering, degree sharing and ties, TEST-010/022/026. |
| F • Operations, M | FR-014 / NFR-002 / NFR-003. As an operator, recover a peak registration term. | After C–E. Deliver scoped reports, load evidence and restored staging copy. Operations lead verifies late events and restoration, TEST-023/024/027. |
## Definition of ready and done
Ready means the owner, actor, scoped example, boundaries, data authority, dependency, approval route and acceptance test are identified. A story involving seats also needs a documented lock order and a rollback case. A solver story needs a manually checkable domain or a representative benchmark dataset.
Done requires working behavior at the normal entry point, linked tests and recorded evidence, updated contracts and traceability, rollback or reconciliation procedure, and the appropriate academic or operational review. Document completion alone does not authorize deployment. Prioritize evidence gaps and release blockers in the risk register during each planning cycle.

## Decision and open question
Proposed: Sequence the work around data and correctness dependencies. Assumed: Sizing is relative until a team and representative data are identified.

Needs approval (RISK-005) — Workload, recovery budgets and solver limits. Operations lead: Collect workload, restore drill and target sign-off.

## References
[requirements](../artifacts/requirements.csv) · [traceability](../artifacts/traceability.csv)
