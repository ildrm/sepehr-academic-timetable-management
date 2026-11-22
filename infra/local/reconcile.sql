-- Read-only checks against an approved, isolated database.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH live AS (
  SELECT sc.pool_id, count(*) AS occupied
  FROM seat_claim sc LEFT JOIN waitlist w ON w.id=sc.waitlist_id
  JOIN capacity_pool p ON p.id=sc.pool_id
  WHERE sc.enrollment_id IS NOT NULL OR (w.state='offered' AND w.expires_at>transaction_timestamp())
  GROUP BY sc.pool_id
)
SELECT count(*) AS pools_above_capacity FROM live JOIN capacity_pool p ON p.id=live.pool_id WHERE live.occupied>p.capacity;
SELECT count(*) AS duplicate_active_course_sets FROM (
 SELECT e.student_id,e.term_id,COALESCE(c.canonical_course_id,c.id)
 FROM enrollment e JOIN course c ON c.id=e.course_id WHERE e.state='active' GROUP BY 1,2,3 HAVING count(*)>1
) duplicate_sets;
SELECT count(*) AS invalid_held_pool_links FROM seat_claim sc LEFT JOIN enrollment e ON e.id=sc.enrollment_id
LEFT JOIN waitlist w ON w.id=sc.waitlist_id JOIN capacity_pool p ON p.id=sc.pool_id
WHERE (e.id IS NOT NULL AND (e.state<>'active' OR e.term_id<>p.term_id))
   OR (w.id IS NOT NULL AND (w.state<>'offered' OR w.term_id<>p.term_id OR NOT sc.pool_id=ANY(w.pool_ids)));
SELECT 'term' AS relation,count(*) FROM term
UNION ALL SELECT 'enrollment',count(*) FROM enrollment
UNION ALL SELECT 'seat_claim',count(*) FROM seat_claim
UNION ALL SELECT 'timetable_version',count(*) FROM timetable_version
UNION ALL SELECT 'outbox_event',count(*) FROM outbox_event
UNION ALL SELECT 'consumer_receipt',count(*) FROM consumer_receipt
UNION ALL SELECT 'allocation_campaign',count(*) FROM allocation_campaign
UNION ALL SELECT 'allocation_application',count(*) FROM allocation_application
UNION ALL SELECT 'allocation_run',count(*) FROM allocation_run
UNION ALL SELECT 'timetable_impact_review',count(*) FROM timetable_impact_review
UNION ALL SELECT 'timetable_change_notice',count(*) FROM timetable_change_notice
UNION ALL SELECT 'notification_intent',count(*) FROM notification_intent ORDER BY 1;
COMMIT;
