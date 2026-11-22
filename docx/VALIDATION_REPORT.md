# Validation report

This release documents a proposed system. Status applies to the evidence and method stated for each check.

| Check | Result | Execution (UTC) and evidence |
|---|---|---|
| Document inventory | passed | 2026-11-22T06:35:53.135817+00:00 · 35 exact chapter filenames and 12 ADRs paired by relative path; source/Word hashes and metadata match. |
| Local links | passed | 2026-11-22T06:35:53.145961+00:00 · 370 source/README relative targets resolved. |
| Native formats | passed | 2026-11-22T06:35:53.161860+00:00 · Parsed 4 .csv, 10 .json, 20 .yaml files. |
| API and JSON Schemas | passed | 2026-11-22T06:35:53.247259+00:00 · OpenAPI 3.1.1 validated; 137 inline examples and four standalone schema/example pairs passed JSON Schema checks. |
| Requirements and modules | passed | 2026-11-22T06:35:53.570427+00:00 · 26 requirement rows cover 41 defined scenarios; all trace links resolve and 40 tables have a single owner. Module imports are acyclic. |
| Contract reconciliation | passed | 2026-11-22T06:35:53.650065+00:00 · Compared API permission/error IDs, event types, all six SQL/catalog state sets, module ownership and permission dimensions. Semantic review limits are recorded separately. |
| Fixture oracles | passed | 2026-11-22T06:35:53.724726+00:00 · Enumerated tiny placement domain: [(['A2', 'B1'], 3)]. Verified the academic fixture has a free lecture seat and full required lab. No production solver or enrollment application executed. |
| Word structure | passed | 2026-11-22T06:35:53.724991+00:00 · 47 readable OOXML packages; 13 embedded diagrams with alt text, repeated table headings and page fields. |
| SQL execution evidence | passed | 2026-11-22T06:35:54.154774+00:00 · Recorded execution 2026-11-22T06:27:24.988342+00:00: 48 DDL statements created 40 public tables on isolated PostgreSQL 17.11. |
| Word visual review | passed | 2026-11-22T06:35:54.154896+00:00 · 58 pages across 47 Word files rendered and visually inspected; evidence matches Word SHA-256 values. |
| Sources and package hygiene | passed | 2026-11-22T06:35:54.155440+00:00 · 10 source records have provenance; checked expected text markers and sensitive-file types. Fixtures were authored as synthetic examples. |
| Application acceptance | not_run | 2026-11-22T06:35:54.159513+00:00 · No application exists in the inspected repository. The documented scenarios are implementation acceptance specifications. |
| Operational and institutional acceptance | not_run | 2026-11-22T06:35:54.159517+00:00 · Measured load, restore drill, policy ratification, fairness and privacy approvals await their accountable roles. |

## Review boundaries

Cross-document checks cover the listed identifiers, state sets, links and selected academic and concurrency invariants. Academic authority, workload limits, recovery targets and legal retention require institutional decisions. The reviewed render is identified by Word hash. Different fonts and office software can change pagination.

[Machine-readable results](validation/results.json) · [Document manifest](MANIFEST.json) · [Open decisions](artifacts/risks-assumptions-decisions.csv)
