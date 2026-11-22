-- Run after deployment grants in the same rolled-back test transaction.
SELECT set_config('academic.test_api_role', :'api_role', true);
SELECT set_config('academic.test_worker_role', :'worker_role', true);
DO $$
DECLARE
  api text := current_setting('academic.test_api_role');
  worker text := current_setting('academic.test_worker_role');
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES
      (api, 'timetable_impact_review', ARRAY['SELECT','INSERT']),
      (api, 'web_session', ARRAY['SELECT','INSERT','UPDATE']),
      (worker, 'notification_intent', ARRAY['SELECT','INSERT','UPDATE']),
      (worker, 'allocation_run', ARRAY['SELECT','UPDATE']),
      (worker, 'worker_heartbeat', ARRAY['SELECT','INSERT','UPDATE'])
    ) AS grants(principal,relation,privileges)
    CROSS JOIN LATERAL unnest(grants.privileges) AS privilege(name)
    WHERE NOT has_table_privilege(grants.principal, grants.relation, privilege.name)
  )
  THEN RAISE EXCEPTION 'Missing runtime permissions for release workflows'; END IF;
  IF has_table_privilege(api, 'development_credential', 'SELECT')
    OR has_table_privilege(worker, 'web_session', 'SELECT')
    OR has_table_privilege(worker, 'oidc_attempt', 'SELECT')
    OR has_table_privilege(worker, 'allocation_application', 'SELECT')
    OR has_schema_privilege(api, 'public', 'CREATE')
    OR has_schema_privilege(worker, 'public', 'CREATE')
  THEN RAISE EXCEPTION 'Unexpected runtime access to restricted storage'; END IF;
END $$;
SET LOCAL ROLE :"api_role";
SELECT 1 FROM allocation_campaign, timetable_impact_review, worker_heartbeat LIMIT 0;
SET LOCAL ROLE :"worker_role";
SELECT 1 FROM outbox_event, allocation_run, solve_job, notification_intent LIMIT 0;
RESET ROLE;
SELECT 'Runtime grants verified in the isolated test database.' AS result;
