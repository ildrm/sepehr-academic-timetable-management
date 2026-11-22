"""Build the documentation in place. Run with Python 3.12+ and requirements.txt."""
from pathlib import Path
import hashlib
import json
import os
import re
import io
import zipfile
from urllib.parse import unquote
from PIL import Image, ImageDraw, ImageFont
import yaml
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
NAVY, TEAL, INK, LIGHT = '153649', '16645F', '233845', 'E4F0ED'
LINK = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
META = re.compile(r'((?:DOC|ADR)-\d+) · Version ([^·]+) · (\w+) · Owner: (.+)')
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def xml(tag, **attributes):
    node = OxmlElement(tag)
    for key, value in attributes.items():
        node.set(qn(key), str(value))
    return node
def font(size, bold=False):
    names = ['Arial Bold.ttf' if bold else 'Arial.ttf',
             'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf']
    paths = [os.getenv('DOCS_FONT_BOLD' if bold else 'DOCS_FONT',''),
             '/System/Library/Fonts/Supplemental/' + names[0],
             '/usr/share/fonts/truetype/dejavu/' + names[1], names[1]]
    for name in paths:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, ValueError):
            continue
    raise SystemExit('Set DOCS_FONT and DOCS_FONT_BOLD to readable TrueType font paths.')
def draw_diagram(source):
    spec = yaml.safe_load(source.read_text())
    rows = spec['rows']
    seq = spec['kind'] == 'sequence'
    h = 103 + len(rows)*80
    img = Image.new('RGB',(1460,h),'#FFFFFF')
    d = ImageDraw.Draw(img)
    regular,bold=font(29),font(30,True)
    def label(x,y,s,f=regular,fill='#233845',anchor='mm'):
        d.text((x,y),s,font=f,fill=fill,anchor=anchor)
    def arrow(x,y,z):
        sign = 1 if z>x else -1
        d.line((x,y,z,y),fill='#17685F',width=5)
        d.polygon([(z,y),(z-sign*17,y-10),(z-sign*17,y+10)],fill='#17685F')
    d.rounded_rectangle((1,1,1458,h-2),radius=15,outline='#BDD0CF',width=3)
    d.rounded_rectangle((13,13,1447,82),radius=8,fill='#183E4D')
    lanes=[*spec['lanes']] if seq else ['Origin','Relationship or transition','Destination']
    xs=[662,1000,1317] if seq else [225,730,1235]
    if seq:label(36,49,'Step',bold,'white','lm')
    for x,lane in zip(xs,lanes): label(x,49,lane,bold,'white')
    for i,(a,b,note) in enumerate(rows):
        y=124+80*i
        if i%2==1:d.rectangle((14,y-35,1445,y+35),fill='#F1F6F5')
        if seq:
            for x in xs:d.line((x,y-39,x,y+39),fill='#A8BBBC',width=2)
            label(35,y,note,regular,anchor='lm')
            arrow(xs[a],y,xs[b])
        else:
            label(xs[0],y,a,bold);label(xs[2],y,b,bold)
            arrow(435,y+18,1020)
            label(xs[1],y-12,note)
    dest=ROOT/'diagrams/rendered'/(source.stem+'.png')
    dest.parent.mkdir(parents=True,exist_ok=True)
    img.save(dest,optimize=True)
def set_style(style,size,color,bold=False):
    style.font.name='Arial'
    style.font.size=Pt(size)
    style.font.color.rgb=RGBColor.from_string(color)
    style.font.bold=bold
def line(p,s,src,out):
    # Convert source links to the corresponding Word targets; native artifacts stay linked.
    parts=re.split(r'(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)',s)
    for piece in parts:
        if not piece:continue
        link=LINK.fullmatch(piece)
        if link:
            name,href=link.groups()
            if not href.startswith(('https://','http://')):
                target=(src.parent/unquote(href)).resolve()
                if target.is_relative_to(ROOT/'source') and target.suffix=='.md':
                    target=ROOT/'word'/target.relative_to(ROOT/'source').with_suffix('.docx')
                href=os.path.relpath(target,out.parent)
            h=xml('w:hyperlink',**{'r:id':p.part.relate_to(href,RT.HYPERLINK,is_external=True)})
            r=xml('w:r');pr=xml('w:rPr');pr.append(xml('w:color',**{'w:val':TEAL}));pr.append(xml('w:u',**{'w:val':'single'}))
            r.append(pr);t=xml('w:t');t.text=name;r.append(t);h.append(r);p._p.append(h)
        elif piece.startswith('**'):
            p.add_run(piece[2:-2]).bold=True
        elif piece.startswith('`'):
            p.add_run(piece[1:-1]).font.name='Courier New'
        else:
            p.add_run(piece)
def render_one(src):
    raw=src.read_text();lines=raw.splitlines()
    title=lines[0][2:];identity,version,status,owner=META.fullmatch(lines[2]).groups()
    out=ROOT/'word'/src.relative_to(ROOT/'source').with_suffix('.docx')
    out.parent.mkdir(parents=True,exist_ok=True)
    doc=Document();doc.core_properties.title=title;doc.core_properties.author='Academic management design documentation'
    sec=doc.sections[0];sec.page_width=Inches(8.27);sec.page_height=Inches(11.69)
    sec.top_margin=Inches(.69);sec.bottom_margin=Inches(.67);sec.left_margin=Inches(.77);sec.right_margin=Inches(.77)
    sec.header_distance=Inches(.28);sec.footer_distance=Inches(.27)
    compact=identity in {'DOC-03','DOC-07','DOC-15','DOC-13','DOC-19','DOC-23','DOC-24','DOC-30','DOC-32'}
    styles=doc.styles
    normal=styles['Normal'];set_style(normal,10 if compact else 10.5,INK);normal.paragraph_format.space_after=Pt(3 if compact else 5)
    normal.paragraph_format.line_spacing=1.03 if compact else 1.10
    for key,size,color in [('Title',26,NAVY),('Heading 1',16,NAVY),('Heading 2',12,TEAL)]:
        style=styles[key];set_style(style,size,color,True)
        style.paragraph_format.space_before=Pt((5 if compact else 8) if key!='Title' else 0)
        style.paragraph_format.space_after=Pt(3);style.paragraph_format.keep_with_next=True
    set_style(styles['Caption'],9,TEAL)
    def small(p,s):
        r=p.add_run(s);r.font.name='Arial';r.font.size=Pt(8.5);r.font.color.rgb=RGBColor.from_string(TEAL)
    small(sec.header.paragraphs[0],'ACADEMIC MANAGEMENT   /   '+('DESIGN DECISIONS' if identity.startswith('ADR') else 'SYSTEM DOCUMENTATION'))
    foot=sec.footer.paragraphs[0];foot.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    small(foot,f'{identity}     /     v{version}     •     ');field=xml('w:fldSimple',**{'w:instr':'PAGE'});foot._p.append(field)
    doc.add_paragraph(title,'Title');meta=doc.add_paragraph();small(meta,f'{identity}    /    v{version}    /    {status.upper()}    /    {owner}')
    headings=[l[3:] for l in lines if l.startswith('## ')]
    toc=len(raw.split())>=510 and len(headings)>=4
    ids={s:'section_'+str(i) for i,s in enumerate(headings,1)}
    i=3
    while i<len(lines):
        s=lines[i];i+=1
        if not s:continue
        if s.startswith('##'):
            level=2 if s.startswith('###') else 1;name=s.strip('# ')
            p=doc.add_heading(name,level)
            split={'DOC-14':'Interaction feedback','DOC-16':'Example exchange','DOC-34':'Technical reference register'}
            if name==split.get(identity):p.paragraph_format.page_break_before=True
            if level==1:
                index=headings.index(name)+1
                p._p.insert(1,xml('w:bookmarkStart',**{'w:id':index,'w:name':ids[name]}));p._p.append(xml('w:bookmarkEnd',**{'w:id':index}))
        elif s.startswith('|'):
            cells=[s.strip('|').split('|')]
            while i<len(lines) and lines[i].startswith('|'):
                row=lines[i].strip('|').split('|');i+=1
                if not all(re.fullmatch(r'[ :-]+',v) for v in row):cells.append(row)
            t=doc.add_table(rows=0,cols=len(cells[0]));t.autofit=False
            widths=([.34,.66] if len(cells[0])==2 else [.27,.32,.41])
            for col,f in zip(t.columns,widths):col.width=Inches(6.73*f)
            for j,row in enumerate(cells):
                tr=t.add_row()
                pr=tr._tr.get_or_add_trPr();pr.append(xml('w:cantSplit'))
                if j==0:pr.append(xml('w:tblHeader',**{'w:val':'true'}))
                for c,v,f in zip(tr.cells,row,widths):
                    c.width=Inches(6.73*f);c._tc.get_or_add_tcPr().append(xml('w:shd',**{'w:fill':NAVY if j==0 else ('EFF5F4' if j%2 else 'FFFFFF')}))
                    p=c.paragraphs[0];p.paragraph_format.space_before=Pt(1.5 if compact else 2.3);p.paragraph_format.space_after=Pt(1.5 if compact else 2.5);p.paragraph_format.line_spacing=1.02
                    r=p.add_run(v.strip());r.bold=j==0;r.font.size=Pt(9.5)
                    if j==0:r.font.color.rgb=RGBColor.from_string('FFFFFF')
        elif s.startswith('!['):
            m=LINK.fullmatch(s[1:]);caption,path=m.groups()
            p=doc.add_paragraph();p.paragraph_format.keep_with_next=True;p.paragraph_format.space_after=Pt(0)
            shape=p.add_run().add_picture(str(src.parent/path),width=Inches(6.7));shape._inline.docPr.set('descr',caption)
            cp=doc.add_paragraph(caption,'Caption');cp.paragraph_format.keep_with_next=False;cp.paragraph_format.space_after=Pt(5)
        elif s.startswith('```'):
            while i<len(lines) and not lines[i].startswith('```'):
                p=doc.add_paragraph();p.paragraph_format.space_after=Pt(0);r=p.add_run(lines[i]);r.font.name='Courier New';r.font.size=Pt(8.5);i+=1
            i+=1
        else:
            p=doc.add_paragraph()
            if re.match(r'^[\u0600-\u06ff]',s):
                p._p.get_or_add_pPr().append(xml('w:bidi'));p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
            line(p,s,src,out)
            if s.startswith('**Dependencies**') and toc:
                p=doc.add_paragraph();small(p,'CONTENTS   ')
                for ix,name in enumerate(headings):
                    if ix:small(p,'   ·   ')
                    h=xml('w:hyperlink',**{'w:anchor':ids[name]});r=xml('w:r');rp=xml('w:rPr');rp.append(xml('w:sz',**{'w:val':17}));rp.append(xml('w:color',**{'w:val':TEAL}));r.append(rp);t=xml('w:t');t.text=name;r.append(t);h.append(r);p._p.append(h)
    # Normalize ZIP member timestamps so unchanged documents retain their evidence hashes.
    buffer=io.BytesIO()
    doc.save(buffer)
    with zipfile.ZipFile(buffer) as source, zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as dest:
        for item in source.infolist():
            item.date_time=(2000,1,1,0,0,0)
            dest.writestr(item,source.read(item.filename))
    field=lambda name:re.search(r'\*\*'+name+r'\*\* — (.+)',raw)[1]
    return dict(identifier=identity,title=title,source_path=str(src.relative_to(ROOT)),word_path=str(out.relative_to(ROOT)),scope_summary=field('Purpose and scope'),status=status,approval_owner_role=owner,dependencies=[str((src.parent/p).resolve().relative_to(ROOT)) for _,p in LINK.findall(field('Dependencies'))],version=version,source_sha256=sha(src),word_sha256=sha(out),generation_status='generated',content_approval_status='needs_approval',visual_review_status='visual_review_pending',validation_results={})
def main():
    for f in sorted((ROOT/'diagrams/source').glob('*.yaml')):draw_diagram(f)
    rows=[render_one(p) for p in sorted((ROOT/'source').rglob('*.md'))]
    (ROOT/'MANIFEST.json').write_text(json.dumps({'documents':rows},ensure_ascii=False,indent=2)+'\n')
    print(f'Built {len(rows)} Word documents. Run validate_docs.py to update evidence.')
if __name__=='__main__':main()
