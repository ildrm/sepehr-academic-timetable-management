# Release gates

| Gate | Current state and work required | Accountable role |
|---|---|---|
| Academic policy | Approve the institutional grading, standing, repeat and credit policies, registration windows, queue tiers, reserves, batch fairness and appeal process. Production rejects the synthetic academic policy. | Registrar and academic policy owner |
| Identity and ingress | Provision the institutional issuer and subject bindings, callback, staff authentication context and scoped role assignments. Verify browser sign-in, role revocation and session lifecycle with the approved provider and public origin. | Identity administrator |
| Timetable planning | Live impact review and controlled repair are implemented. Approve institutional time, travel, teaching-pattern and cohort inputs and test a representative term. Hold activation where a required source or constraint is missing. | Planning lead and registrar |
| Batch allocation | Campaign approval, preferences, bounded exact optimization, capacity revalidation and atomic publication are implemented. Approve classifications, reserve/priority settings, evidence and appeal workflow. The release model supports at most 64 applicants and four alternatives per applicant per campaign. Validate these limits against the real workload. | Registrar |
| Integrations | Durable HTTPS notification delivery is configurable. Approve the actual gateway and reconcile test acknowledgments with its implementation. Learning and finance adapters remain outside activation pending approved protocols and data flows. | Integration lead |
| Reporting and privacy | Approve export thresholds, reporting audiences, retention and legal handling. Complete delegated degree exports, other disclosure scenarios, audit and end-to-end retention checks before enabling the affected features. | Registrar and privacy officer |
| Operations and acceptance | Provision the approved target and ratify ingress and monitoring thresholds. Run production-scale and fault tests, point-in-time recovery, provider replay, full role and accessibility checks, and sign off on the release. | Operations owner and institutional reviewers |

The [requirements matrix](REQUIREMENTS_COVERAGE.csv) records remaining engineering and verification by requirement. The [deployment runbook](../infra/deployment/README.md) describes the activation sequence.
