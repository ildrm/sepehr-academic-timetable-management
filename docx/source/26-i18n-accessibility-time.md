# Persian interface, accessibility and time

DOC-26 · Version 0.1 · proposed · Owner: UX lead

**Purpose and scope** — Define mixed-direction text, equivalent access and authoritative time handling.

**Audience** — Designers, engineers and academic planners.

**Dependencies** — [Calendar and academic workflows](07-calendar-state-workflows.md), [Next.js frontend and user experience](14-nextjs-frontend-ux.md), [Instructor and timetable planner guide](28-faculty-planner-user-guide.md).

## Persian and bidirectional rendering
Set the page language to fa and the product direction to RTL. Use logical CSS properties for alignment and focus order. Isolate English identifiers, timestamps and email addresses with bdi or an explicit LTR span, preserving punctuation and token order. Keep stored identifiers canonical and copyable. The English documentation and code use LTR.
نمونه درس آزمایشی
Present a section code such as SYN-A in its own LTR isolate beside the Persian label. Normalize Arabic Yeh and Kaf variants to Persian ی and ک in search keys, apply Unicode normalization and map Persian/Arabic-Indic digits to ASCII for numeric validation. Preserve original display spelling, meaningful zero-width non-joiners and unmodified opaque IDs. Search equivalence must not merge distinct academic identifiers.

## Accessible journeys
Provide visible focus, skip navigation, descriptive labels, text alongside icons and an announced status region. Support keyboard-only selection of every component. Expose conflicts in an ordered list with affected dates; do not rely on color. Pair a visual weekly grid with a table ordered by weekday, local time, course code, room and accessible status. Test contrast, zoom, screen-reader order and mixed-direction copy/paste with Persian speakers. WCAG 2.2 AA is a proposed acceptance reference.
## Clock and recurrence
Store absolute decisions as timestamptz instants. Recurring meetings retain IANA zone, local weekday/start, duration, teaching weeks and dated exceptions. Expand in that zone with an explicit institutional resolution for ambiguous or nonexistent civil times. Reject unresolved occurrences at validation. Adjacent half-open intervals can touch; a campus travel allowance may still make the pair invalid. Remove holidays and add makeup sessions by local date before conflict detection. Persian-calendar input converts at the UI boundary with a displayed Gregorian/offset confirmation for important deadlines. Locale alone establishes neither timezone nor jurisdiction.

## Decision and open question
Proposed: Store recurring local time with its zone and occurrence exceptions. Assumed: Persian is the primary UI locale; the institution selects its own civil zone.

Needs approval (RISK-003) — Jurisdiction, timezone, calendar and interval policy. Product owner: Record institutional zone, conflict policy and counsel review.

## References
[test scenarios](../artifacts/test-scenarios.yaml) · [state machines](../artifacts/state-machines.yaml)

[Web Content Accessibility Guidelines](https://www.w3.org/TR/WCAG22/)
