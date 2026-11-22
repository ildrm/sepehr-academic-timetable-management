DO $fixture$
DECLARE
  inst bigint; eng bigint; arts bigint; prog bigint; prog2 bigint; cur bigint; cur2 bigint; t bigint; closed bigint; policy bigint;
  student bigint; faculty bigint; room1 bigint; pool bigint; labpool bigint; sectionid bigint; lectureid bigint; labid bigint;
  offeringid bigint; courseid bigint; published bigint; initial_admin bigint; i integer; u text;
  codes text[]:=ARRAY['SYN-CS101','SYN-CS210','SYN-CS211','SYN-MA205','SYN-FA101','SYN-CS320','SYN-CS121','SYN-CS410','SYN-CS450','SYN-CS460'];
  titles text[]:=ARRAY['مبانی برنامه‌نویسی','ساختمان داده‌ها','آزمایشگاه ساختمان داده‌ها','ریاضیات گسسته','هنر و رسانه','شبکه‌های رایانه‌ای','برنامه‌نویسی کاربردی','طراحی نرم‌افزار','معماری رایانه','پایگاه داده'];
  day date := ((clock_timestamp() AT TIME ZONE 'Etc/UTC')::date+7);
  units numeric[]:=ARRAY[3,3,1,3,2,3,3,3,3,3];
BEGIN
  INSERT INTO org_unit(code,kind) VALUES('SYN-INSTITUTION','institution') RETURNING id INTO inst;
  INSERT INTO org_unit(code,kind,parent_id) VALUES('SYN-ENGINEERING','faculty',inst) RETURNING id INTO eng;
  INSERT INTO org_unit(code,kind,parent_id) VALUES('SYN-ARTS','faculty',inst) RETURNING id INTO arts;
  INSERT INTO program(unit_id,code,degree_level) VALUES(eng,'SYN-COMPUTING','bachelor') RETURNING id INTO prog;
  INSERT INTO program(unit_id,code,degree_level) VALUES(arts,'SYN-MEDIA','bachelor') RETURNING id INTO prog2;
  INSERT INTO curriculum_version(program_id,edition,effective_from,requirements)
    VALUES(prog,'SYN-1405-A',day-500,'{"groups":[{"id":"core","courses":["SYN-CS101","SYN-CS210"],"credits":"6.00"}]}') RETURNING id INTO cur;
  INSERT INTO curriculum_version(program_id,edition,effective_from,requirements)
    VALUES(prog2,'SYN-1405-B',day-500,'{"groups":[{"id":"core","courses":["SYN-FA101"],"credits":"2.00"}]}') RETURNING id INTO cur2;
  INSERT INTO term(code,zone,opens_at,closes_at) VALUES('SYN-OPEN','Etc/UTC',clock_timestamp()-interval '1 day',clock_timestamp()+interval '120 days') RETURNING id INTO t;
  INSERT INTO term(code,zone,opens_at,closes_at) VALUES('SYN-CLOSED','Etc/UTC',clock_timestamp()-interval '30 days',clock_timestamp()-interval '10 days') RETURNING id INTO closed;
  INSERT INTO term_scope VALUES(t,inst),(closed,inst);
  INSERT INTO queue_guard VALUES(t),(closed);
  INSERT INTO policy_version(unit_id,edition,state,parameters) VALUES(inst,'SYN-HYPOTHETICAL-A','approved',
    '{"mode":"synthetic","approvalReference":"synthetic fixture only","ceiling":"9.00","floor":"3.00","windowMode":"term","repeatSelection":"latest","repeatPassed":false,"thresholds":{"PASS":"10.000"},"queue":{"order":"strict","offerMinutes":60,"tiers":{"SYN-COMPUTING":0,"SYN-MEDIA":1},"reservationGroups":{"SYN-COMPUTING":["computing"]}}}')
    RETURNING id INTO policy;
  INSERT INTO identity_account(issuer,subject) VALUES('internal-worker','waitlist');
  FOREACH u IN ARRAY ARRAY['student.demo','student.second','student.arts','planner.demo','approver.demo','office.demo','instructor.demo'] LOOP
    INSERT INTO identity_account(issuer,subject) VALUES('local-development',u) RETURNING id INTO student;
    IF u LIKE 'student.%' THEN
      INSERT INTO student_program(student_id,program_id,curriculum_id,admitted_on)
        VALUES(student,CASE WHEN u='student.arts' THEN prog2 ELSE prog END,CASE WHEN u='student.arts' THEN cur2 ELSE cur END,day-90);
      INSERT INTO student_term(student_id,term_id,student_program_id,policy_id)
        SELECT student,tt.id,sp.id,policy FROM student_program sp CROSS JOIN term tt WHERE sp.student_id=student;
      INSERT INTO appointment(student_id,term_id,opens_at,closes_at) SELECT student,id,opens_at,closes_at FROM term;
    END IF;
    INSERT INTO role_assignment(actor_id,role_code,unit_id,valid_from,valid_until) VALUES(student,
      CASE u WHEN 'planner.demo' THEN 'planner' WHEN 'approver.demo' THEN 'academic_admin'
        WHEN 'office.demo' THEN 'academic_office' WHEN 'instructor.demo' THEN 'instructor' ELSE 'student' END,
      CASE WHEN u IN ('planner.demo','approver.demo') THEN inst WHEN u='student.arts' THEN arts ELSE eng END,
      clock_timestamp()-interval '1 day',clock_timestamp()+interval '120 days');
    IF u='instructor.demo' THEN faculty:=student; END IF;
    IF u='approver.demo' THEN initial_admin:=student; END IF;
  END LOOP;
  INSERT INTO instructor(id,unit_id,workload_limit) VALUES(faculty,eng,60);
  INSERT INTO availability(instructor_id,term_id,starts_at,ends_at)
    VALUES(faculty,t,clock_timestamp()-interval '1 day',clock_timestamp()+interval '90 days');
  INSERT INTO room(code,campus,capacity) VALUES('R-101','SYN-CAMPUS',40) RETURNING id INTO room1;
  INSERT INTO room(code,campus,capacity) VALUES('LAB-201','SYN-CAMPUS',12);
  INSERT INTO room_feature(room_id,feature) VALUES(room1,'accessible');
  INSERT INTO timetable_version(term_id,state,input_epoch,content_hash,proposer_id)
    VALUES(t,'published',0,'synthetic-initial-schedule',initial_admin) RETURNING id INTO published;
  FOR i IN 1..array_length(codes,1) LOOP
    INSERT INTO course(code,title,credits) VALUES(codes[i],titles[i],units[i]) RETURNING id INTO courseid;
    INSERT INTO curriculum_course(curriculum_id,course_id,classification,requirement_group)
      VALUES(CASE WHEN i=5 THEN cur2 ELSE cur END,courseid,CASE WHEN i IN (1,2,5) THEN 'core' ELSE 'elective' END,'core');
    INSERT INTO qualification(instructor_id,course_id,valid_from) VALUES(faculty,courseid,day-30);
    INSERT INTO offering(course_id,term_id,unit_id,credit_value,search_title)
      VALUES(courseid,t,CASE WHEN i=5 THEN arts ELSE eng END,units[i],titles[i]) RETURNING id INTO offeringid;
    IF i=7 THEN
      SELECT s.pool_id INTO pool FROM section s JOIN offering o ON o.id=s.offering_id JOIN course c ON c.id=o.course_id WHERE c.code=codes[1];
      UPDATE course SET canonical_course_id=(SELECT id FROM course WHERE code=codes[1]) WHERE id=courseid;
    ELSE
      INSERT INTO capacity_pool(term_id,capacity) VALUES(t,CASE WHEN i=6 THEN 1 WHEN i=8 THEN 0 ELSE 24 END) RETURNING id INTO pool;
    END IF;
    INSERT INTO section(offering_id,code,pool_id) VALUES(offeringid,'01',pool) RETURNING id INTO sectionid;
    INSERT INTO component(section_id,kind,pool_id,required_pattern,contact_minutes) VALUES(sectionid,'lecture',pool,'core',60) RETURNING id INTO lectureid;
    INSERT INTO meeting(version_id,component_id,instructor_id,room_id,local_day,local_start,duration_minutes,week_dates,zone,exception_dates)
      VALUES(published,lectureid,faculty,room1,EXTRACT(ISODOW FROM day+i)::int,'09:00',60,ARRAY[day+i],'Etc/UTC','{}');
    IF i=2 THEN
      INSERT INTO capacity_pool(term_id,capacity) VALUES(t,6) RETURNING id INTO labpool;
      INSERT INTO component(section_id,kind,pool_id,required_pattern,contact_minutes) VALUES(sectionid,'lab',labpool,'core',45) RETURNING id INTO labid;
      INSERT INTO meeting(version_id,component_id,instructor_id,room_id,local_day,local_start,duration_minutes,week_dates,zone,exception_dates)
        SELECT published,labid,faculty,r.id,EXTRACT(ISODOW FROM day+i)::int,'10:30',45,ARRAY[day+i],'Etc/UTC','{}' FROM room r WHERE r.code='LAB-201';
      INSERT INTO section_bundle VALUES(sectionid,ARRAY[lectureid,labid]);
      INSERT INTO academic_rule(policy_id,rule_code,stage,expression,target_course_id,waivable) VALUES(policy,'SYN-PREREQ','registration',
        '{"op":"OR","children":[{"op":"minimumGrade","course":"SYN-CS101","thresholdParam":"PASS"},{"op":"recognizedEquivalent","course":"SYN-CS101"}]}',courseid,true);
    ELSE
      INSERT INTO section_bundle VALUES(sectionid,ARRAY[lectureid]);
    END IF;
    IF i=3 THEN
      INSERT INTO academic_rule(policy_id,rule_code,stage,expression,target_course_id) VALUES(policy,'SYN-COREQUISITE','registration',
        '{"op":"concurrent","course":"SYN-CS210"}',courseid);
    END IF;
    IF i=5 THEN INSERT INTO reservation(pool_id,eligibility_group,seats,release_at) VALUES(pool,'computing',2,clock_timestamp()+interval '10 days'); END IF;
  END LOOP;
  INSERT INTO academic_record(student_id,course_id,attempt_key,revision,outcome,grade,earned_credits)
    SELECT a.id,c.id,'SYN-ATTEMPT-CS101',1,'passed',16,3 FROM identity_account a CROSS JOIN course c
    WHERE a.subject IN('student.demo','student.second') AND c.code='SYN-CS101';
  INSERT INTO case_delegation(case_ref,actor_id,student_id,term_id,valid_until)
    SELECT 'SYN-CASE',a.id,s.id,t,clock_timestamp()+interval '60 days' FROM identity_account a CROSS JOIN identity_account s
      WHERE a.subject='office.demo' AND s.subject='student.demo';
END
$fixture$;