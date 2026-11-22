#!/usr/bin/env python3
"""근해어업 14개 업종을 content.js에 반영한다.
 1) 책자 PDF에서 모식도·조업구역도·확인사항 그림을 잘라 img/geunhae/ 에 저장
 2) 확인사항에 쓰인 법령 조문을 법령 PDF에서 뽑아 lawTexts 에 추가
 3) 확인사항에 쓰인 별표의 '해당 업종 쪽'만 이미지로 뽑아 lawBp 에 추가 (업종별 쪽 번호는 byNode)
사용: python3 build_geunhae.py <업로드 폴더> <앱 폴더>"""
import sys, os, re, json, glob, logging, pickle
sys.path.insert(0, os.path.dirname(__file__))
logging.getLogger('pdfminer').setLevel(logging.ERROR)
import pdfplumber
from extract_articles import articles, load_lines, clean
from crop_booklet import crop
import law_build as LB
from geunhae_data import FISH

BOOK = '74568b5a'
PDFS = {  # 법령명 → (파일 앞부분, 코드)
    '수산업법': ('b4c804fa', 'law-fish'), '수산업법 시행령': ('f8af3da7', 'sirae-decree'), '수산업법 시행규칙': ('eb29acc8', 'sirae-rule'),
    '수산자원관리법': ('b728fa13', 'res-law'), '수산자원관리법 시행령': ('c270d314', 'res-decree'),
}
META = {k: v for k, v in [(l['name'], l['meta']) for l in LB.LAWS]}

def pdf_path(src, key): return glob.glob(os.path.join(src, key + '*'))[0]

_cache = {}
def page_texts(pdf):
    if pdf in _cache: return _cache[pdf]
    f = '/tmp/pt_' + os.path.basename(pdf)[:8] + '.pkl'
    if os.path.exists(f): _cache[pdf] = pickle.load(open(f, 'rb')); return _cache[pdf]
    with pdfplumber.open(pdf) as d: t = [(pg.extract_text() or '') for pg in d.pages]
    pickle.dump(t, open(f, 'wb')); _cache[pdf] = t; return t

def bp_ranges(texts):
    """[별표 N] 제목 쪽을 찾아 {번호: (시작쪽, 끝쪽)} (쪽은 1부터)"""
    heads = []
    for i, t in enumerate(texts):
        for m in re.finditer(r'■\s*[^\n\[]*\[별표\s*(\d+(?:의\d+)?)\]', t): heads.append((i + 1, m.group(1)))
    out = {}
    for k, (pg, no) in enumerate(heads):
        end = (heads[k + 1][0] - 1 if k + 1 < len(heads) else min(len(texts), pg + 8))
        if k + 1 < len(heads) and heads[k + 1][0] == pg: end = pg
        out[no] = (pg, max(pg, end))
    return out

def squash(s): return re.sub(r'\s+', '', s)

def bp_title(texts, pg, no):
    t = texts[pg - 1]
    m = re.search(r'\[별표\s*' + re.escape(no) + r'\](?:\s*<[^>]*>)?\s*(.+?)\s*\((제[^)]*?관련)\)', t, re.S)
    if not m: return '', ''
    return re.sub(r'\s+', ' ', m.group(1)).strip(), re.sub(r'\s+', ' ', m.group(2)).strip()

def pages_for(law, no, fish, src):
    texts = page_texts(pdf_path(src, PDFS[law][0])); R = bp_ranges(texts); a, b = R[no]
    allp = list(range(a, b + 1))
    key = (law, no)
    if key == ('수산업법 시행령', '2'):                       # 어구·어법: 업종 머리글 기준 (근해어업 구간)
        allh = []
        for F in FISH:
            for h in F['heads']:
                for i in allp:
                    m = re.search(r'^[가-힣]\.\s*' + re.escape(h) + r'\s*$', texts[i - 1], re.M)
                    if m: allh.append((i, m.start(), F['id'])); break
        allh.sort()
        # 근해어업 구간 끝: 연안어업 첫 머리글('연안') 쪽
        coast = next((i for i in allp if re.search(r'^[가-힣]\.\s*연안\S*어업\s*$', texts[i - 1], re.M) and i > allh[-1][0]), allh[-1][0] + 1)
        pages = set()
        for k, (pg, ps, fid) in enumerate(allh):
            if fid != fish['id']: continue
            if k + 1 < len(allh): nx, nps = allh[k + 1][0], allh[k + 1][1]
            else: nx, nps = coast, 0
            end = nx - 1 if nps < 80 else nx
            pages.update(range(pg, max(pg, end) + 1))
        if not pages: print('[경고] 별표 2 머리글 없음', fish['id'])
        return sorted(pages)
    if key in (('수산업법 시행령', '7'), ('수산업법 시행령', '8'), ('수산업법 시행령', '5')):
        kws = [squash(k) for k in fish['kw']]
        rows = [i for i in allp if any(k in squash(texts[i - 1]) for k in kws)]
        pages = {a} | set(rows)
        if no == '7':                                             # 주(註) 정의 쪽
            nums = set()
            for i in rows: nums |= set(re.findall(r'주(\d+)\)', texts[i - 1]))
            for n in nums:
                for i in allp:
                    if re.search(r'^주' + n + r'\)\s*\S', texts[i - 1], re.M): pages.add(i); break
        return sorted(pages)
    return allp

def main(src, app):
    cpath = os.path.join(app, 'content.js')
    raw = open(cpath, encoding='utf-8').read(); data = json.loads(raw.split('=', 1)[1].strip().rstrip(';'))
    book = pdf_path(src, BOOK)
    nodes = {}
    def walk(ns):
        for n in ns:
            nodes[n['id']] = n; walk(n.get('children') or [])
    walk(data['tree'])
    parent = nodes['geunhae-1']; par = None
    for n in nodes.values():
        if any(c['id'] == 'geunhae-1' for c in (n.get('children') or [])): par = n
    imgdir = os.path.join(app, 'img', 'geunhae'); os.makedirs(imgdir, exist_ok=True)

    def make(fid, c, tag):
        out = f'img/geunhae/{fid}-{c["page"]}{tag}.jpg'
        crop(book, c['page'], os.path.join(app, out), c['mode'])
        return out

    law_users = {}   # (법령, 별표) → set(업종 id)
    refs = set()     # (법령, 조문)
    def scan(fid, law):
        for line in str(law or '').split('\n'):
            P = None
            m = re.match(r'^(.+?)\s+(제\d+조|별표)', line.strip())
            if not m: continue
            name = m.group(1).strip(); rest = line.strip()[len(name):]
            if name not in PDFS: continue
            for t in re.split(r'\s*,\s*', rest.strip()):
                j = re.match(r'^(제\d+조(?:의\d+)?)', t)
                b = re.match(r'^별표\s*(\d+(?:의\d+)?)', t)
                if j: refs.add((name, j.group(1)))
                if b: law_users.setdefault((name, b.group(1)), set()).add(fid)

    order = []
    for F in FISH:
        n = nodes[F['id']]; order.append(F['id'])
        if F.get('keep'):
            # 시범 업종: 조업금지구역도·진해만 지도 추가, 법령 문구는 이전 단계에서 확정
            n['maps'] = [dict(src=make(F['id'], dict(page=58, mode='map'), ''), caption='기선권현망 조업금지구역도', law="수산자원관리법 제15조제1항\n수산자원관리법 시행령 제7조제1항, 별표 9")]
            n['checks'][0].setdefault('imgs', [dict(src=make(F['id'], dict(page=56, mode='0.06,0.38,0.94,0.90'), ''), caption='주6) 해역 (책자: 진해만 해역)')])
            for c in n['checks']: scan(F['id'], c.get('law'))
            scan(F['id'], n['maps'][0]['law'])
            continue
        n['type'] = 'inspection'; n['intro'] = F['intro']
        n['roles'] = [dict(name=a, desc=b) for a, b in F.get('roles', [])] or n.get('roles', [])
        if not F.get('roles'): n.pop('roles', None)
        n['images'] = [dict(src=make(F['id'], c, ''), caption=c['caption']) for c in F['images']]
        mapsLaw = F.get('mapsLaw', {})
        n['maps'] = [dict(src=make(F['id'], c, ''), caption=c['caption'], law=mapsLaw.get(c['page'], '')) for c in F['maps']]
        n['checks'] = []
        for c in F['checks']:
            d = {k: v for k, v in c.items() if k != 'imgs'}
            if c.get('imgs'): d['imgs'] = [dict(src=make(F['id'], i, 'c'), caption=i['caption']) for i in c['imgs']]
            n['checks'].append(d)
        for k in ('soon', 'soonText'): n.pop(k, None)
        for c in n['checks']: scan(F['id'], c.get('law'))
        for m in n['maps']: scan(F['id'], m.get('law'))
    # 근해어업 목록을 책자 순서로
    par['children'] = [nodes[i] for i in order] + [c for c in par['children'] if c['id'] not in order]

    # ---- 조문 ----
    texts_new = 0
    for name, jo in sorted(refs):
        key = f'{name}|{jo}'
        if key in data['lawTexts']: continue
        arts = articles(load_lines(pdf_path(src, PDFS[name][0])))
        if jo not in arts: print('[경고] 조문 없음', key); continue
        t = clean(arts[jo]['lines'])
        t = re.sub(r'\n?[ ]*' + re.escape(name) + r'$', '', t, flags=re.M)
        data['lawTexts'][key] = dict(title=arts[jo]['title'], text=t); texts_new += 1
    for k, v in META.items(): data['lawMeta'].setdefault(k, v)

    # ---- 별표 ----
    os.makedirs(os.path.join(app, 'img', 'law'), exist_ok=True)
    data['lawBp'] = {}
    for (name, no), users in sorted(law_users.items()):
        pdf = pdf_path(src, PDFS[name][0]); code = PDFS[name][1]; texts = page_texts(pdf)
        R = bp_ranges(texts)
        if no not in R: print('[경고] 별표 없음', name, no); continue
        title, ref = bp_title(texts, R[no][0], no)
        union, by = [], {}
        for fid in sorted(users, key=order.index):
            F = next(x for x in FISH if x['id'] == fid)
            pg = pages_for(name, no, F, src); by[fid] = pg
            for q in pg:
                if q not in union: union.append(q)
        union.sort()
        pages = []
        for q in union:
            out = f'img/law/{code}-별표{no}-p{q}.jpg'.replace(' ', '')
            if not os.path.exists(os.path.join(app, out)): LB.render(pdf, q, os.path.join(app, out))
            pages.append(dict(src=out, page=q))
        ent = dict(title=title, ref=ref, pages=pages, byNode={fid: [union.index(q) for q in by[fid]] for fid in by})
        full = R[no][1] - R[no][0] + 1
        if len(union) < full and len(by) >= 1: ent['partial'] = f'해당 업종과 관련된 쪽만 발췌했습니다 (원문 별표 {full}쪽 중 일부). 전체는 법령정보센터 원문을 보세요.'
        data['lawBp'][f'{name}|별표 {no}'] = ent
    data['version'] = data.get('version', 6) + 1
    open(cpath, 'w', encoding='utf-8').write('window.CONTENT = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    print('조문 추가', texts_new, '/ 별표', len(data['lawBp']))
    for k, v in data['lawBp'].items(): print(' ', k, len(v['pages']), '쪽', {a: len(b) for a, b in v['byNode'].items()} if len(v['byNode']) < 6 else f'업종 {len(v["byNode"])}개')

if __name__ == '__main__':
    main(*sys.argv[1:3])
