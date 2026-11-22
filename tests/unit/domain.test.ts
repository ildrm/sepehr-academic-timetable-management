import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRule,evaluate,quantity,Facts } from '../../packages/backend-core/policy';
import { allocate } from '../../packages/backend-core/degree';
import { apiAccepts } from '../../packages/contracts/runtime';
import { occurrences,overlaps,absoluteInterval } from '../../packages/backend-core/meeting';
import { normalizeSearch } from '../../packages/backend-core/portal';

const facts:Facts={records:new Map([['A',{state:'passed',grade:'14.750'}],['B',{state:'in_progress',grade:null}]]),
  known:new Set(['A','B','C']),concurrent:new Set(['C']),equivalents:new Set(['C']),grants:new Set(),program:'P',
  credits:300n,gpa:null,standing:null,thresholds:{pass:'12.500'},repeatPassed:false};
test('prerequisite alternatives, grades, current study and concurrent course retain distinct semantics',()=>{
  assert.equal(evaluate(compileRule({op:'OR',children:[{op:'completed',course:'B'},{op:'minimumGrade',course:'A',thresholdParam:'pass'}]}),facts),true);
  assert.equal(evaluate(compileRule({op:'completed',course:'B'}),facts),false);
  assert.equal(evaluate(compileRule({op:'concurrent',course:'C'}),facts),true);
  assert.equal(evaluate(compileRule({op:'recognizedEquivalent',course:'C'}),facts),true);
  assert.equal(evaluate(compileRule({op:'NOT',child:{op:'standing',value:'probation'}}),facts),null);
});
test('rule compiler rejects unknown operators, excess depth and unbound course IDs',()=>{
  assert.throws(()=>compileRule({op:'eval',codes:['A']}));
  let tooDeep:unknown={op:'completed',course:'A'};
  for(let i=0;i<20;i++)tooDeep={op:'NOT',child:tooDeep};
  assert.throws(()=>compileRule(tooDeep));
  assert.throws(()=>evaluate(compileRule({op:'completed',course:'MISSING'}),facts));
  assert.equal(quantity('3.07',2),307n);
});
test('degree allocation consumes an exclusive completed course once',()=>{
  const groups=[{id:'core',courses:['A'],credits:'3.00'},{id:'option',courses:['C'],credits:'3.00'}];
  const attempt={id:'r1',course:'A',credits:'3.00',grade:'14.750',equivalents:['C']};
  const result=allocate(groups,[attempt]);
  assert.deepEqual(result.map(g=>g.earned),['3.00','0.00']);
  assert.deepEqual(result.map(g=>g.allocations),[[{recordId:'r1',credits:'3.00'}],[]]);
  assert.deepEqual(allocate(groups.map(x=>({...x,sharingKey:'approved'})),[attempt]).map(g=>g.earned),['3.00','3.00']);
  const backtracked=allocate(groups,[attempt,{id:'r2',course:'A',credits:'4.00',grade:null,equivalents:[]}]);
  assert.deepEqual(backtracked.map(g=>g.allocations),[[{recordId:'r2',credits:'3.00'}],[{recordId:'r1',credits:'3.00'}]]);
});
test('requests conform to OpenAPI and reject duplicate and invented inputs',()=>{
  assert.equal(apiAccepts('enrollInput',{termId:'1',bundles:[{sectionId:'9',componentIds:['2']}]}),true);
  assert.equal(apiAccepts('enrollInput',{termId:'1',bundles:[{sectionId:'9',componentIds:['2','2']}]}),false);
  assert.equal(apiAccepts('enrollInput',{termId:'1',studentId:'42',bundles:[{sectionId:'9',componentIds:['2']}]}),false);
});
test('Persian search normalization and half-open occurrence exceptions',()=>{
  assert.equal(normalizeSearch('كی ۱۲٣'),'کی 123');
  const [makeup]=occurrences({component_id:1n,room:'A',campus:'B',zone:'Etc/UTC',start_minute:540,duration_minutes:90,
    dates:['2030-01-01'],exception_dates:{cancelled:['2030-01-01'],added:[{weekDate:'2030-01-02',startMinute:540,endMinute:630}]}});
  assert.equal(makeup.weekDate,'2030-01-02');
  assert.equal(overlaps(makeup,{weekDate:makeup.weekDate,startMinute:630,endMinute:660}),false);
});
test('local times reject daylight-saving gaps and repeats without ratified disambiguation',()=>{
  const options={weekDate:'2026-11-01',startMinute:90,endMinute:180};
  assert.throws(()=>absoluteInterval(options,'America/New_York'));
  assert.throws(()=>absoluteInterval({weekDate:'2026-03-08',startMinute:150,endMinute:240},'America/New_York'));
  assert.equal(absoluteInterval(options,'Etc/UTC').start.toISOString(),'2026-11-01T01:30:00.000Z');
});
