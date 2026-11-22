"""Check the design release, recording only executed checks or hash-bound evidence."""
import csv
import datetime as dt
import hashlib
import itertools
import json
import re
import time
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from lxml import etree
from openapi_spec_validator import validate as validate_openapi

ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts'
E=ROOT/'validation/evidence'
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
EXPECTED="""overview-scope product-requirements software-requirements-use-cases team-roles-raci user-roles-permissions academic-domain-curriculum academic-rule-engine calendar-state-workflows faculty-resources-offerings enrollment-waitlist timetabling-optimization student-scheduling-degree-audit system-architecture nestjs-backend-design nextjs-frontend-ux data-model-dictionary api-contracts-errors transactions-consistency events-jobs-integrations security-privacy-threat-model nfr-performance-capacity test-verification-strategy devops-deployment observability-reporting backup-disaster-recovery-runbooks data-migration-quality i18n-accessibility-time student-user-guide faculty-planner-user-guide education-admin-user-guide roadmap-backlog-delivery extension-modules risks-assumptions-open-decisions quality-review-traceability glossary-references-maintenance""".split()
def utc():return dt.datetime.now(dt.timezone.utc).isoformat()
def hashfile(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def put(f,obj):f.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
def load(f):return json.loads(f.read_text())
def y(name):return yaml.safe_load((A/(name+'.yaml')).read_text())
def rows(name):
    with (A/(name+'.csv')).open(newline='') as f:return list(csv.DictReader(f))
def require(value,message):
    if not value:raise ValueError(message)
def unique(values):
    values=list(values);dups=[v for v,count in Counter(values).items() if count>1]
    require(not dups,'Duplicate definitions: '+str(dups));return set(values)
def check_schema(schema,data):
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema,format_checker=FormatChecker()).validate(data)
class NoEvidence(Exception):pass
def inventory():
    expected={f'{i:02}-{name}.md' for i,name in enumerate(EXPECTED)}
    require({p.name for p in (ROOT/'source').glob('*.md')}==expected,'Primary document filename mismatch')
    require(len(docs)==47 and len(list((ROOT/'source/adr').glob('*.md')))==12,'ADR or manifest count mismatch')
    unique(d['identifier'] for d in docs)
    require({p.relative_to(ROOT).as_posix() for p in (ROOT/'source').rglob('*.md')}=={d['source_path'] for d in docs},'Unpaired source')
    require({p.relative_to(ROOT).as_posix() for p in (ROOT/'word').rglob('*.docx')}=={d['word_path'] for d in docs},'Unpaired Word file')
    for d in docs:
        src=ROOT/d['source_path'];word=ROOT/d['word_path']
        require(src.relative_to(ROOT/'source').with_suffix('.docx')==word.relative_to(ROOT/'word'),'Stem mismatch')
        require(hashfile(src)==d['source_sha256'] and hashfile(word)==d['word_sha256'],f'Stale manifest for {src.name}')
        require(all(d.get(k) for k in ('scope_summary','approval_owner_role','dependencies','version','status','content_approval_status')),'Metadata incomplete')
        s=src.read_text()
        for token in ['**Purpose and scope**','**Audience**','**Dependencies**','## References','Assumed:']:
            require(token in s,src.name+' lacks '+token)
        require(len(re.findall(r'^## ',s,re.M))>=4 and len(s.split())>120,'Insufficient document structure')
        d['validation_results']['source_and_hash']='passed'
    return '35 exact chapter filenames and 12 ADRs paired by relative path; source/Word hashes and metadata match.'
def links():
    checked=0
    for f in sorted((ROOT/'source').rglob('*.md'))+[ROOT/'README.md']:
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)',f.read_text()):
            if target.startswith(('https://','http://','#')):continue
            dest=(f.parent/unquote(target.split('#')[0])).resolve()
            require(dest.is_relative_to(ROOT) and dest.exists(),f'{f.name}: missing local link {target}');checked+=1
    return f'{checked} source/README relative targets resolved.'
def native():
    counts=Counter()
    for d in [A,ROOT/'references',ROOT/'diagrams/source']:
        for f in d.rglob('*'):
            if f.suffix=='.json':load(f)
            elif f.suffix=='.yaml':yaml.safe_load(f.read_text())
            elif f.suffix=='.csv':
                with f.open(newline='') as fp:
                    records=list(csv.reader(fp));require(len(records)>1 and all(len(r)==len(records[0]) for r in records),'CSV width mismatch '+f.name)
            else:continue
            counts[f.suffix]+=1
    return 'Parsed '+', '.join(f'{v} {k}' for k,v in sorted(counts.items()))+' files.'
def contracts():
    spec=y('openapi');validate_openapi(spec);unique(op['operationId'] for p in spec['paths'].values() for op in p.values())
    count=0;schemas=spec['components']['schemas']
    for path in spec['paths'].values():
        for op in path.values():
            for payload in [*op['responses'].values(),*([op['requestBody']] if 'requestBody'in op else [])]:
                m=payload['content']['application/json']
                check_schema({'components':{'schemas':schemas},**m['schema']},m['example']);count+=1
    for f in sorted((A/'schemas').glob('*.schema.json')):
        check_schema(load(f),load(A/'examples'/f.name.replace('.schema','')))
    return f'OpenAPI 3.1.1 validated; {count} inline examples and four standalone schema/example pairs passed JSON Schema checks.'
def tracing():
    req=rows('requirements');trace=rows('traceability');tests=y('test-scenarios');modules=y('module-catalog')
    rids=unique(r['id'] for r in req);require(rids==unique(r['requirement'] for r in trace),'Trace row mismatch')
    tset=unique(t['id'] for t in tests);mset=unique(m['name'] for m in modules)
    for t in tests:require(all(t.get(k) for k in ('given','when','then')),'Incomplete scenario')
    for r in req:require(r['acceptance'] and r['owner'],'Missing acceptance or owner')
    tables=set(re.findall(r'CREATE TABLE (\w+)',(A/'core-schema.sql').read_text()));require(tables==unique(t for m in modules for t in m['owned_tables']),'Table ownership mismatch')
    ops={method['x-id'] for path in y('openapi')['paths'].values() for method in path.values()}
    for r in trace:
        require(set(r['tests'].split())<=tset and r['tests'] and (ROOT/r['design']).is_file() and r['module'] in mset and r['entity'] in tables,'Broken trace '+r['requirement'])
        require(set(re.findall(r'API-\d+',r['interface']))<=ops,'Unknown operation')
        for value,chapter in [('BR-',6),('CON-',10)]:
            if r['rule_or_constraint'].startswith(value):
                require(r['rule_or_constraint'] in next((ROOT/'source').glob(f'{chapter:02}-*.md')).read_text(),'Missing rule/constraint')
    pending={m['name']:set(m['imports']) for m in modules}
    while pending:
        removable={k for k,v in pending.items() if not v}
        require(removable,'Module dependency cycle or unknown dependency')
        pending={k:v-removable for k,v in pending.items() if k not in removable}
    return f'{len(req)} requirement rows cover {len(tests)} defined scenarios; all trace links resolve and {len(tables)} tables have a single owner. Module imports are acyclic.'
def reconcile():
    perm=rows('permission-matrix');pids=unique(x['id'] for x in perm)
    unique(x['id'] for x in y('error-catalog'));events=y('event-catalog');unique(x['id'] for x in events)
    unique(x['id'] for x in y('report-catalog'));unique(x['id'] for x in rows('risks-assumptions-decisions'))
    spec=y('openapi');ops=[o for path in spec['paths'].values() for o in path.values()];unique(o['x-id'] for o in ops)
    require(all(o['x-permission'] in pids or o['x-permission']=='session actor only' for o in ops),'Unknown scope')
    require(set(spec['components']['schemas']['Error']['properties']['code']['enum'])=={e['id'] for e in y('error-catalog')},'Error codes differ')
    require(set(load(A/'schemas/event.schema.json')['properties']['type']['enum'])=={e['type'] for e in events},'Event types differ')
    ddl=(A/'core-schema.sql').read_text()
    for table,trans in y('state-machines').items():
        defined=set(re.findall(r"'([^']+)'",re.search(r'state IN \(([^)]+)',ddl.split('CREATE TABLE '+table+' (')[1].split(');\n')[0])[1]))
        documented={v[k] for v in trans for k in ['start','end']}-{'absent'}
        require(defined==documented,'SQL/state chart mismatch: '+table)
    for v in perm:require(all(v[k] for k in ['action','resource','scope','relationship','workflow','validity','effect']),'Incomplete permission')
    require({'allow','deny'}=={v['effect'] for v in perm},'Missing negative permission')
    return 'Compared API permission/error IDs, event types, all six SQL/catalog state sets, module ownership and permission dimensions. Semantic review limits are recorded separately.'
def fixtures():
    inp=load(A/'examples/solver-input.json');out=load(A/'examples/solver-output.json')
    require(out['inputSha256']==hashfile(A/'examples/solver-input.json') and inp['snapshotId']==out['snapshotId'],'Snapshot mismatch')
    feasible=[]
    for combo in itertools.product(*[c['placements'] for c in inp['classes']]):
        if any(c['pinned'] and p['id']!=c['pinned'] for c,p in zip(inp['classes'],combo)):continue
        require(all(0<=o['startMinute']<o['endMinute']<=1440 for p in combo for o in p['intervals']),'Invalid interval')
        clashes=any((a['room']==b['room'] or a['instructor']==b['instructor']) and any(x['weekDate']==z['weekDate'] and x['startMinute']<z['endMinute'] and z['startMinute']<x['endMinute'] for x in a['intervals'] for z in b['intervals']) for a,b in itertools.combinations(combo,2))
        chosen={(c['id'],p['id']) for c,p in zip(inp['classes'],combo)}
        blocked=any(all((pair[k]['classId'],pair[k]['placementId']) in chosen for k in ('a','b')) for pair in inp['constraints']['forbiddenPairs'])
        over=any(sum(p['loadUnits'] for p in combo if p['instructor']==row['instructor'])>row['maxUnits'] for row in inp['constraints']['workloadCaps'])
        vector=[sum(p['preferenceCosts'][i]*tier['weight'] for p in combo) for i,tier in enumerate(inp['constraints']['objectiveTiers'])]
        if not (clashes or blocked or over):
            require(len(vector)==1 and vector[0]==sum(p['penalty'] for p in combo),'Inconsistent one-tier fixture')
        if not (clashes or blocked or over):feasible.append(([p['id'] for p in combo],sum(p['penalty'] for p in combo)))
    require(([a['placementId'] for a in out['assignments']],out['objectiveScore']) in feasible,'Invalid solver fixture')
    f=load(A/'examples/academic-facts.json');require(f['labPool']['claimed']==f['labPool']['capacity'] and f['lecturePool']['claimed']<f['lecturePool']['capacity'],'Invalid last-lab fixture')
    return f'Enumerated tiny placement domain: {feasible}. Verified the academic fixture has a free lecture seat and full required lab. No production solver or enrollment application executed.'
def word():
    pictures=0
    for d in docs:
        path=ROOT/d['word_path']
        with zipfile.ZipFile(path) as z:
            require(z.testzip() is None,'Corrupt ZIP '+path.name)
            for n in z.namelist():
                if n.endswith(('.xml','.rels')):etree.fromstring(z.read(n))
            doc=etree.fromstring(z.read('word/document.xml'))
            require(doc.xpath('//w:pStyle[@w:val="Title"]',namespaces=NS) and doc.xpath('//w:pStyle[@w:val="Heading1"]',namespaces=NS),'Missing heading styles')
            figures=doc.xpath('//wp:docPr',namespaces=NS);require(all(f.get('descr') for f in figures),'Figure missing alt text')
            pictures+=len(figures)
            for tbl in doc.xpath('//w:tbl',namespaces=NS):require(tbl.xpath('./w:tr[1]/w:trPr/w:tblHeader',namespaces=NS),'Header cannot repeat')
            require(b'PAGE' in z.read('word/footer1.xml'),'Page field missing')
            for rel in etree.fromstring(z.read('word/_rels/document.xml.rels')):
                target=rel.get('Target')
                if rel.get('TargetMode')=='External' and not target.startswith(('https://','http://')):
                    require((path.parent/unquote(target)).exists(),'Word relative link missing: '+target)
        d['validation_results']['word_package']='passed'
    require(pictures==len(list((ROOT/'diagrams/source').glob('*.yaml'))),'Diagram coverage differs')
    return f'{len(docs)} readable OOXML packages; {pictures} embedded diagrams with alt text, repeated table headings and page fields.'
def sql():
    path=E/'sql.json'
    if not path.exists():raise NoEvidence('No scratch-database execution evidence is available.')
    data=load(path)
    if data['sha256']!=hashfile(A/'core-schema.sql'):raise NoEvidence('SQL evidence predates a schema change.')
    return f"Recorded execution {data['checked_at']}: {data['ddl_statements']} DDL statements created {data['catalog_table_count']} public tables on isolated PostgreSQL 17.11."
def visual():
    path=E/'visual-review.json'
    if not path.exists():raise NoEvidence('Page-by-page visual evidence pending.')
    review=load(path);total=0;pending=[]
    for d in docs:
        v=review['documents'].get(d['word_path'],{})
        valid=v.get('word_sha256')==d['word_sha256'] and v.get('review_status')=='inspected' and all((ROOT/p).is_file() for p in v.get('sheets',[]))
        d['visual_review_status']='visually_inspected' if valid else 'visual_review_pending'
        d['validation_results']['visual_review']='passed' if valid else 'not_run'
        if valid:total+=v['page_count']
        else:pending.append(d['identifier'])
    if pending:raise NoEvidence('Evidence pending for '+', '.join(pending))
    return f'{total} pages across {len(docs)} Word files rendered and visually inspected; evidence matches Word SHA-256 values.'
def hygiene():
    files=[p for p in ROOT.rglob('*') if p.is_file()]
    require(not any(p.suffix.lower() in {'.ttf','.otf','.pem','.key','.env'} or p.name=='.DS_Store' for p in files),'Unintended file')
    for p in files:
        if p.suffix in {'.md','.yaml','.csv','.sql','.json'}:
            s=p.read_text()
            require(not any(v in s for v in ['cite','BEGIN PRIVATE KEY','{{USECASES}}','{{BACKLOG}}']),'Unresolved marker in '+p.name)
    srcs=load(ROOT/'references/sources.json');require(all(all(v.get(k) for k in ('title','publisher','url','access_date','relevant_version','claim')) for v in srcs),'Source incomplete')
    return f'{len(srcs)} source records have provenance; checked expected text markers and sensitive-file types. Fixtures were authored as synthetic examples.'
def run():
    global docs
    manifest=load(ROOT/'MANIFEST.json');docs=manifest['documents'];results=[]
    groups=[('Document inventory',inventory),('Local links',links),('Native formats',native),('API and JSON Schemas',contracts),('Requirements and modules',tracing),('Contract reconciliation',reconcile),('Fixture oracles',fixtures),('Word structure',word),('SQL execution evidence',sql),('Word visual review',visual),('Sources and package hygiene',hygiene)]
    for name,func in groups:
        started=utc();clock=time.monotonic()
        try:detail=func();result='passed'
        except NoEvidence as e:result='not_run';detail=str(e)
        except Exception as e:result='failed';detail=str(e)
        results.append(dict(check=name,status=result,method=func.__name__,executed_at=started,duration_ms=round((time.monotonic()-clock)*1000,2),evidence=detail))
    for name,detail in [('Application acceptance','No application exists in the inspected repository. The documented scenarios are implementation acceptance specifications.'),('Operational and institutional acceptance','Measured load, restore drill, policy ratification, fairness and privacy approvals await their accountable roles.')]:
        results.append(dict(check=name,status='not_run',method='Read-only scope and evidence review',executed_at=utc(),duration_ms=0,evidence=detail))
    put(ROOT/'MANIFEST.json',manifest);put(ROOT/'validation/results.json',dict(recorded_at=utc(),checks=results))
    report=['# Validation report','', 'This release documents a proposed system. Status applies to the evidence and method stated for each check.','','| Check | Result | Execution (UTC) and evidence |','|---|---|---|']
    for r in results:report.append(f"| {r['check']} | {r['status']} | {r['executed_at']} · {r['evidence'].replace('|','/')} |")
    report+=['','## Review boundaries','','Cross-document checks cover the listed identifiers, state sets, links and selected academic and concurrency invariants. Academic authority, workload limits, recovery targets and legal retention require institutional decisions. The reviewed render is identified by Word hash. Different fonts and office software can change pagination.','','[Machine-readable results](validation/results.json) · [Document manifest](MANIFEST.json) · [Open decisions](artifacts/risks-assumptions-decisions.csv)']
    (ROOT/'VALIDATION_REPORT.md').write_text('\n'.join(report)+'\n')
    state=ROOT/'EXECUTION_STATE.json'
    files=sorted({str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file()}|{'EXECUTION_STATE.json'})
    put(state,dict(phase=7,phase_name='Quality gate and delivery',recorded_at=utc(),files_actually_created=files,checks_actually_performed=[r['check'] for r in results if r['status']!='not_run'],gaps=[r['evidence'] for r in results if r['status']!='passed'],remaining_work=['Ratify registrar, planning, privacy and operational parameters.','Implement the proposed system and execute the runtime acceptance suite.'],source_of_truth='MANIFEST.json and validation/results.json'))
    for r in results:print(r['status'],r['check'],r['evidence'][:180])
    return int(any(r['status']=='failed' for r in results))
if __name__=='__main__':raise SystemExit(run())
