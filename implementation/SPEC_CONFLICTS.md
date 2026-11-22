# Specification gaps

- DOC-07 requires operation-specific windows. The illustrative DDL defines only one term window and appointment. The migration adds optional operation windows. A term policy must explicitly select its window mode.
- The term-registration documents describe published meetings and linked component patterns. The SQL artifact has no canonical cross-list identity or structured bundle table. The migration adds both fields while preserving the documented enrollment and claim entities.
- API-007 covers the session actor's own intent namespace and also permits staff recovery under the original delegation. Delegated changes require explicit case authority. Unconfigured delegation blocks those requests.
- The design leaves institutional queue tiers, exceptions, calendar rules, provider details and objective values for named owners. Synthetic fixtures carry explicit values for local validation only.

- API-013 requires a scoped cursor. The implementation binds the cursor to actor, term and department and preserves the returned read timestamp. It uses stable offering IDs for navigation. Persisted multi-request report snapshots and historical paged views remain additional work.
- DOC-10 supports post-publication repair and an impact assessment. The publication service currently blocks a replacement if the term has active enrollments, pending implementation of the affected-student workflow.
- DOC-18 permits operation-specific external adapters. No approved delivery channel or finance provider was specified. Durable notification intents expose an explicit unconfigured state.
- Campus travel and local time ambiguity require explicit policies. Registration uses configured directional travel minutes and rejects unconfigured transfers. An ambiguous or nonexistent local meeting boundary is blocked pending ratified disambiguation.
