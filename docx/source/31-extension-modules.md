# Extension modules

DOC-31 · Version 0.1 · proposed · Owner: Product owner

**Purpose and scope** — Define entry conditions and data contracts for deferred academic services.

**Audience** — Product managers and integration owners.

**Dependencies** — [Academic domain and curriculum](05-academic-domain-curriculum.md), [Events, jobs and integrations](18-events-jobs-integrations.md), [Security and privacy](19-security-privacy-threat-model.md).

## Extension gates and ownership
|Extension|Core dependency and proposed contract|Authority and release gate|
|---|---|---|
|Grade entry, appeals and transcripts|Consume roster and final enrollment identity. Publish a confirmed attempt revision after approval.|Examination/records office owns grades and appeal decisions. Protect finalized transcript versions and test corrections.|
|Examinations|Use published meetings, enrollment and accommodations. Create a separate exam sitting/seat assignment.|Exam office approves clashes, invigilation, privacy and independent exam capacity.|
|Attendance and session delivery|Instantiate a dated meeting from a publication hash. Record cancellations and actual delivery separately.|Instructor records presence under explicit roster scope. Ratify retention and correction rules.|
|Tuition and instructor compensation|Consume enrollment, withdrawal and teaching facts with stable external references.|Finance owns ledger, refunds and pay rules. Reconcile duplicated events and pending adjustments.|
|Learning platform|Publish scoped course/roster membership and dated withdrawals.|Learning platform owns activity. Authenticate callbacks and reconcile stale rosters.|
|Demand forecasting|Use privacy-reviewed snapshots of choices, queues and unmet demand.|Planning owner assesses bias and explains forecast uncertainty. Forecasts influence soft preferences only unless approved.|
## Integration boundary
Keep a minimal authoritative completion input even when full grading is deferred. Enable a new extension only after field stewardship, identity mapping, outage posture, schema versioning and data retention have owners. Trial downstream consumers on a synthetic replay. For financial effects, require provider-side deduplication or explicit reconciliation before retrying an ambiguous outcome.

## Decision and open question
Proposed: Enable integrations only after field ownership and outage behavior are agreed. Assumed: Deferred platforms can exchange stable identities and revisions.

Needs approval (RISK-009) — Third-party finance hold freshness and outages. Finance owner: Ratify outage posture before adapter activation.

## References
[event catalog](../artifacts/event-catalog.yaml) · [report catalog](../artifacts/report-catalog.yaml)
