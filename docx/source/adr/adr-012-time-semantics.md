# Decision instants and local recurrence

ADR-012 · Version 0.1 · proposed · Owner: Registrar

**Purpose and scope** — Decide how to address the following design pressure. Registration has a dispute-sensitive cutoff. Weekly teaching follows local civil dates.

**Audience** — Registrar, implementation leads and quality reviewers.

**Dependencies** — [Calendar and academic workflows](../07-calendar-state-workflows.md), [Registration transactions](../17-transactions-consistency.md), [Persian interface, accessibility and time](../26-i18n-accessibility-time.md).

## Alternatives and decision
Receipt time rewards queued attempts. A fixed UTC weekly recurrence shifts local teaching across clock changes.

Decide windows at the locked database decision time; use half-open intervals. Store meeting local time, zone, week pattern and exceptions.

## Rationale and consequences
One decision instant resolves deadline races while local recurrences remain explainable. Ratify timezone, calendar conversions and ambiguous-time resolution; preserve offsets in evidence.

## Risks, assumptions and open question
Unapproved timezone defaults can alter either seats or occurrences. Assumed: The registrar can enumerate operation-specific windows.

## Reconsideration trigger
Revisit after a timezone rule or approved registration deadline policy changes. The registrar owns review and approval.

## References
[Calendar and academic workflows](../07-calendar-state-workflows.md), [Registration transactions](../17-transactions-consistency.md), [Persian interface, accessibility and time](../26-i18n-accessibility-time.md).
