#!/usr/bin/env python3
"""법령 PDF → content.js 병합 도구 (조문 텍스트 + 별표 원문 페이지 이미지)
사용: python3 law_build.py <PDF가 있는 폴더> <앱 폴더>
 - lawTexts : 조문 텍스트 (앱에서 '조문 보기' 시트)
 - lawBp    : 별표 원문 페이지 이미지 (앱에서 '별표 보기' 시트, 오프라인 가능)
 - lawMeta  : 시행일·공포번호
법령이 개정되면 PDF만 교체하고 이 도구를 다시 실행한다."""
import sys, os, re, json, glob, subprocess, tempfile, shutil
sys.path.insert(0, os.path.dirname(__file__))
from extract_articles import articles, load_lines, clean
from PIL import Image, ImageChops

# 파일명 앞부분(해시 제외 키워드) → 법령 설정
LAWS = [
  dict(match='eb29acc8', name='수산업법 시행규칙', code='sirae-rule', meta='시행 2026.10.22. · 해양수산부령 제832호',
       arts=['제41조'],
       bp={'별표 7': dict(title='근해어업의 종류별 어선 기관의 마력 및 부속선의 수와 규모 등', ref='제41조제1항 본문 관련', pages=[36, 37], focus=37)}),
  dict(match='f8af3da7', name='수산업법 시행령', code='sirae-decree', meta='시행 2026.10.22. · 대통령령 제36781호',
       arts=[],
       bp={'별표 7': dict(title='어업의 종류별 어구사용의 금지구역 및 금지기간', ref='제38조제2항 관련', pages=[119, 123, 131], focus=123, partial='근해어업 표의 첫 쪽·기선권현망 쪽·주(註) 쪽만 발췌했습니다. 전체는 법령정보센터 원문을 보세요.'),
           '별표 3': dict(title='혼획이 허용되는 어업의 종류와 수산동물 및 혼획의 허용 범위', ref='제24조제1항 관련', pages=[110], focus=110),
           '별표 2': dict(title='어업별 어구의 규모ㆍ형태ㆍ재질ㆍ사용량 및 사용방법', ref='제21조제2항, 제22조제2항, 제23조제2항 및 제38조제1항 관련', pages=[65, 66], focus=65, partial='근해어업 중 기선권현망어업 부분만 발췌했습니다. 전체는 법령정보센터 원문을 보세요.')}),
  dict(match='c270d314', name='수산자원관리법 시행령', code='res-decree', meta='시행 2026.7.1. · 대통령령 제36423호',
       arts=['제7조'],
       bp={'별표 9': dict(title='기선권현망어업의 조업금지구역', ref='제7조제1항제7호 관련', pages=list(range(53, 60)), focus=53)}),
  dict(match='b728fa13', name='수산자원관리법', code='res-law', meta='시행 2026.9.18. · 법률 제21467호', arts=['제15조'], bp={}),
]
FIX = [('마력및', '마력 및')]

def render(pdf, page, out):
    tmp = tempfile.mkdtemp()
    subprocess.check_call(['pdftoppm', '-r', '110', '-f', str(page), '-l', str(page), '-jpeg', '-jpegopt', 'quality=72', pdf, os.path.join(tmp, 'p')])
    f = glob.glob(os.path.join(tmp, 'p*.jpg'))[0]
    im = Image.open(f).convert('L')
    bg = Image.new('L', im.size, 255)
    box = ImageChops.difference(im, bg).point(lambda v: 255 if v > 40 else 0).getbbox()
    if box:
        m = 14; box = (max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m)); im = im.crop(box)
    im.save(out, quality=72, optimize=True); shutil.rmtree(tmp)

def main(src, app):
    cpath = os.path.join(app, 'content.js')
    raw = open(cpath, encoding='utf-8').read()
    head, body = raw.split('=', 1)
    data = json.loads(body.strip().rstrip(';'))
    data.setdefault('lawTexts', {}); data.setdefault('lawBp', {}); data.setdefault('lawMeta', {})
    os.makedirs(os.path.join(app, 'img', 'law'), exist_ok=True)
    for L in LAWS:
        pdf = glob.glob(os.path.join(src, L['match'] + '*'))[0]
        data['lawMeta'][L['name']] = L['meta']
        if L['arts']:
            arts = articles(load_lines(pdf))
            for a in L['arts']:
                t = clean(arts[a]['lines'])
                t = re.sub(r'\n?\s*' + re.escape(L['name']) + r'$', '', t, flags=re.M)
                for x, y in FIX: t = t.replace(x, y)
                data['lawTexts'][f"{L['name']}|{a}"] = {'title': arts[a]['title'], 'text': t}
        for bname, b in L['bp'].items():
            pages = []
            for p in b['pages']:
                out = f"img/law/{L['code']}-{bname.replace(' ', '')}-p{p}.jpg"
                render(pdf, p, os.path.join(app, out)); pages.append({'src': out, 'page': p})
            ent = {'title': b['title'], 'ref': b['ref'], 'pages': pages, 'focus': b['focus'] and b['pages'].index(b['focus'])}
            if b.get('partial'): ent['partial'] = b['partial']
            data['lawBp'][f"{L['name']}|{bname}"] = ent
    open(cpath, 'w', encoding='utf-8').write('window.CONTENT = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    print('ok', len(data['lawTexts']), 'articles', len(data['lawBp']), 'byeolpyo')

if __name__ == '__main__':
    main(*sys.argv[1:3])
