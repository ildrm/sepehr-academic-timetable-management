# Academic domain and curriculum

DOC-05 · Version 0.1 · proposed · Owner: Registrar

**Purpose and scope** — Distinguish earned credit from teaching resources and preserve the student’s curriculum.

**Audience** — Academic office and data designers.

**Dependencies** — [Academic data dictionary](15-data-model-dictionary.md), [Data migration and reconciliation](25-data-migration-quality.md).

## From catalog to classroom
A catalog course is the academic identity awarded credit. An offering instantiates that course in one term and freezes its credit value. A section is a selectable delivery alternative. A component is a lecture, laboratory or other required part. A meeting places one component at a time and place. A bundle is one permitted set of components in the selected section. Two cross-listed sections can draw from the same physical pool.
Credit measures progress toward a qualification. Contact minutes measure supervised time. Session count counts actual occurrences. Workload applies an approved conversion to assigned teaching. Adding a laboratory to a three-credit hypothetical course changes meetings and workload but still awards three credits.

## Curriculum assignment
Program defines a degree level and owning department. A student-program record adds specialization and pins a curriculum edition at admission. General education, foundational, core, specialized and elective are classifications of a course within a curriculum. A course may satisfy different categories in two editions. An approved transfer between editions records the old and new assignment, effective date, reason, approver and an impact comparison.
Degree groups may require a course, a number of distinct credits, a choice among approved alternatives or a minimum grade. Equivalencies point from recognized source to target, with curriculum, validity interval and approval. Recognition of A as B does not imply the reverse. History uses revisions; a corrected grade preserves the previous attempt and triggers eligibility review.

## Hand-checkable transfer
Suppose a synthetic student earns three credits in X and an approved directional mapping recognizes X for a three-credit requirement Y. An exclusive allocation consumes X once. A second elective bucket remains unmet unless the curriculum explicitly permits shared satisfaction. Transfer credit amount, grade conversion and transcript display require separate policy parameters.

## Decision and open question
Proposed: Pin curriculum at admission and freeze credit on the offering. Assumed: Admission records identify program and curriculum edition.

Needs approval (RISK-001) — Thresholds, GPA scales, exception and sharing parameters. Academic senate delegate: Approve policy editions, samples and applicability.

## References
[core schema](../artifacts/core-schema.sql) · [academic facts](../artifacts/examples/academic-facts.json)
