# Implementation decisions

- The specification files carry proposed design status. The implementation prompt authorizes building the core workflows, and institutional business values still require documented approval. The local seed marks a hypothetical policy explicitly and refuses to run without an isolated database name and explicit environment flags.
- Target Node 24 LTS. Use Prisma migrations and the PostgreSQL adapter. Parameterized SQL is reserved for complex reads, guard acquisition and checked updates inside one Prisma transaction.
- The API binds to loopback by default. The Next.js BFF passes the original scoped session cookie, CSRF proof and origin under an explicit route allowlist.

- API routes run in Nest.js feature modules. Shared domain use cases live in packages/backend-core. The BullMQ worker invokes the same eligibility and capacity operations used by the API.
- The first release uses a strict overlapping-bundle queue strategy. The development policy supplies fictional priorities by program and reserved-seat mappings. There is no permissive fallback when the grading policy, queue tiers or travel time require configuration.
- The OIDC adapter uses exact issuer/subject bindings, PKCE, single-use state tied to the browser, and a signed ID token. A staff session also requires an institution-configured authentication context value.
- The SQL schema keeps the bundle array primary key and other PostgreSQL constraints. Prisma does not expose the bundle model as a CRUD entity. The section relation is explicitly ignored, and controlled SQL handles that table.
- Live repairs compare normalized occurrences and run the same overlap and directional travel checks as registration. The impact review binds to the validated proposal, active version, changed components and affected enrollment revisions.
- Batch campaigns require an approved policy reference, named course classifications and a seed commitment. The solver uses exact credit fractions, then total credits and the committed tie-break within each priority tier. The bounded model accepts up to 64 applicants and four alternatives per applicant. Publication rechecks live eligibility and capacity under the term guard.
- Schedule suggestions honor up to five course preferences in the order entered. They search at most 32 one- or two-course additions and report the timetable and policy versions used.
- Production deployment uses dedicated database roles, operator-controlled migrations and verified HTTPS, PostgreSQL and Redis connections. The optional notification gateway uses the durable event ID for retries and acknowledgment.
