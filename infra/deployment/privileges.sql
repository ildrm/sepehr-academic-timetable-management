\set ON_ERROR_STOP on
-- Apply to the migrated application database as its owner.
-- The two runtime roles must already exist and have independently provisioned credentials.
SELECT format('GRANT CONNECT ON DATABASE %I TO %I, %I',current_database(),:'api_role',:'worker_role') \gexec
SELECT format('REVOKE CREATE ON SCHEMA public FROM PUBLIC, %I, %I',:'api_role',:'worker_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I, %I',:'api_role',:'worker_role') \gexec

SELECT format('GRANT SELECT ON %s TO %I',
  string_agg(format('%I.%I',schemaname,tablename),', ' ORDER BY tablename),:'api_role')
FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','development_credential') \gexec
SELECT format('GRANT SELECT ON academic_record, academic_rule, appointment, allocation_run, capacity_pool,
  component, consumer_receipt, course, enrollment, enrollment_component, equivalency, exception_grant,
  identity_account, meeting, notification_intent, offering, operation_window, org_unit, outbox_event, policy_version,
  program, quarantine_event, queue_guard, reservation, review_case, role_assignment, room, seat_claim, section,
  section_bundle, solve_job, solve_snapshot, student_program, student_term, term, timetable_version, waitlist,
  worker_heartbeat TO %I',:'worker_role') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I, %I',:'api_role',:'worker_role') \gexec

SELECT format('GRANT INSERT ON allocation_application, allocation_campaign, allocation_run, appointment, academic_record,
  academic_rule, audit_entry, availability, capacity_pool, component, component_room_requirement, course,
  curriculum_review, curriculum_version, enrollment, enrollment_component, exception_grant, import_batch,
  meeting, offering, oidc_attempt, operation_window, org_unit, outbox_event, policy_author, policy_version,
  program, queue_guard, room, room_feature, seat_claim, section, section_bundle, solve_job, solve_snapshot, student_program,
  student_term, term, term_scope, timetable_change_notice, timetable_impact_review, timetable_version, validation_record, waitlist,
  web_session, idempotency_record TO %I',:'api_role') \gexec
SELECT format('GRANT UPDATE ON allocation_application, allocation_campaign, allocation_run, capacity_pool, curriculum_review,
  enrollment, exception_grant, identity_account, idempotency_record, operation_window, policy_version, queue_guard,
  solve_job, student_term, term, timetable_version, waitlist, web_session TO %I',:'api_role') \gexec
SELECT format('GRANT DELETE ON oidc_attempt, seat_claim TO %I',:'api_role') \gexec

SELECT format('GRANT INSERT ON audit_entry, consumer_receipt, enrollment, enrollment_component, notification_intent,
  outbox_event, quarantine_event, review_case, seat_claim, timetable_version, worker_heartbeat TO %I',:'worker_role') \gexec
SELECT format('GRANT UPDATE ON allocation_run, capacity_pool, enrollment, notification_intent, outbox_event, queue_guard, solve_job,
  student_term, term, waitlist, worker_heartbeat TO %I',:'worker_role') \gexec
SELECT format('GRANT DELETE ON seat_claim TO %I',:'worker_role') \gexec
