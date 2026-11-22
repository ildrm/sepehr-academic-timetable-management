# Data migration and reconciliation

DOC-25 · Version 0.1 · proposed · Owner: Registrar

**Purpose and scope** — Move academic history with traceable mappings and a reversible cutover.

**Audience** — Data stewards and migration engineers.

**Dependencies** — [Academic domain and curriculum](05-academic-domain-curriculum.md), [Academic rule evaluation](06-academic-rule-engine.md), [Academic data dictionary](15-data-model-dictionary.md).

## Mapping pipeline
Inventory sources, authority, encoding, timezone, grading scale and export cutoff. Map stable legacy codes for units, programs, curriculum editions, students, terms, courses, directed equivalencies and attempts. Preserve the original value, normalized value, source key and mapping revision. Use exact decimal conversions and approve grade-scale mappings before assigning pass status. Ambiguous identifiers or a missing curriculum edition block the row.
Stage immutable extracts with checksums, counts and effective times. Dry-run in an isolated copy. Detect duplicate subjects, conflicting attempts, invalid foreign references, asymmetric equivalency assumptions and impossible credit totals. Quarantine unresolved rows instead of merging by display name. The office decides whether two records represent corrections or distinct attempts.

For a legacy grade correction with the same student, attempt and source revision but different grades, quarantine both payloads and preserve checksums. For a verified correction with a new revision, append it to the original lineage and re-evaluate any provisional prerequisites. Do not infer approval from a later import timestamp.

## Acceptance and cutover
Reconcile by term, program and source: record counts, earned-credit sums, distinct attempts, active roster sizes, physical claims and degree audit samples. Independently reproduce prerequisite decisions at the cutoff. Record mapping version, exception list, control totals, approver role and timestamp. A zero count difference can conceal offsetting grade errors; compare per-attempt samples and changed decisions.
Freeze legacy writes or capture an ordered delta. Import the final delta idempotently by source key and revision. Keep a read-only legacy snapshot and cutover ledger. Before opening writes a failed reconciliation returns to the prior system. After new writes begin, pause registration, reconcile new receipts and apply an approved forward correction or controlled reverse mapping before returning authority.

## Decision and open question
Proposed: Authorize cutover only after scope-level reconciliations and decision samples match. Assumed: Legacy data stewards can resolve ambiguous attempts.

Needs approval (RISK-001) — Thresholds, GPA scales, exception and sharing parameters. Academic senate delegate: Approve policy editions, samples and applicability.

## References
[core schema](../artifacts/core-schema.sql) · [test scenarios](../artifacts/test-scenarios.yaml)
