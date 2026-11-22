# Instructor and timetable planner guide

DOC-28 · Version 0.1 · proposed · Owner: Planning lead

**Purpose and scope** — Submit availability, investigate conflicts and route changes for approval.

**Audience** — Instructors, department heads and planners.

**Dependencies** — [Instructors, resources and offerings](08-faculty-resources-offerings.md), [Timetabling optimization](10-timetabling-optimization.md), [Next.js frontend and user experience](14-nextjs-frontend-ux.md).

## Instructor and department preparation
In the proposed availability view, select your assigned term and department, enter recurring availability and dated exceptions, and specify campus travel limits. Review a local-date preview that includes holidays and makeup sessions. Submit qualifications and workload changes to the responsible department. A submitted preference is distinguishable from a mandatory unavailability.
The planner opens the resource inventory, resolves missing equipment and confirms linked component patterns. Pin commitments that the department has approved. Run preflight. When a class has no candidate placements, inspect the eliminated room, instructor and time options; correct source data or seek a documented policy change.

## From proposal to publication
Submit the snapshot, track the run reference and read solution status, unassigned items and scores. UNKNOWN warrants further diagnosis or an explicitly authorized new run. FEASIBLE permits review. Compare the candidate with the previous schedule, inspect the accessible meeting table, and submit it to independent validation. After a manual edit, validate the new content hash. An authorized approver distinct from the proposer checks freshness, impact and evidence before publishing.
When replacing an instructor after publication, list every affected occurrence and student. Confirm the substitute’s qualifications, availability, workload and travel. Create a repair draft, compare disruptions and arrange approval. Keep the earlier version for audit. Track notices against the publication event and escalate undelivered messages to student services.

## Decision and open question
Proposed: Route manual and generated candidates through the same validation gate. Assumed: Planners can verify dated room and instructor records.

Needs approval (RISK-006) — Solver weights and hard cohort commitments. Planning lead: Approve constraints and representative benchmark corpus.

## References
[solver output](../artifacts/examples/solver-output.json) · [state machines](../artifacts/state-machines.yaml)
