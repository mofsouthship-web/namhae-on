#!/usr/bin/env python3
"""법령정보센터에서 내려받은 법령 PDF에서 조문을 뽑아 JSON으로 저장한다.
사용: python3 extract_articles.py 법령.pdf "수산업법" 제42조 제59조 제60조 > out.json
"""
import re, sys, json, logging
logging.getLogger("pdfminer").setLevel(logging.ERROR)
import pdfplumber

HEAD = re.compile(r'^\s*(제\d+조(?:의\d+)?)\(([^)]*)\)')
ITEM = re.compile(r'^\s*([①-⑳]|\d+\.\s|\d+의\d+\.\s|[가-힣]\.\s)')

def load_lines(pdf_path):
    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for pg in pdf.pages:
            for ln in (pg.extract_text() or '').split('\n'):
                lines.append(ln.rstrip())
    return lines

def articles(lines):
    out, cur = {}, None
    for ln in lines:
        m = HEAD.match(ln)
        if m:
            cur = m.group(1)
            if cur not in out:                       # 중복 추출 방지(첫 것만)
                out[cur] = {'title': m.group(2), 'lines': [ln[m.end():]]}   # 제목 줄에 이어진 ① 본문 포함
            else:
                cur = None
            continue
        if re.match(r'^\s*제\d+장', ln) or re.match(r'^\s*제\d+절', ln) or ln.strip() == '부칙':
            cur = None
            continue
        if cur:
            out[cur]['lines'].append(ln)
    return out

# PDF 줄바꿈 지점에서 띄어쓰기가 빠지는 알려진 경우 (발견될 때마다 추가)
FIXES = [('적절한조치', '적절한 조치'), ('호에따라', '호에 따라'), ('다음각 호', '다음 각 호'), ('다음각호', '다음 각 호')]

def clean(lines):
    paras = []
    for ln in lines:
        s = re.sub(r'\s+', ' ', ln).strip()
        if not s or re.fullmatch(r'[「」\s]*', s) or re.search(r'법제처\s+\d+\s+국가법령정보센터', s):
            continue
        if ITEM.match(s) or not paras:
            paras.append(s)
        else:
            paras[-1] += s                        # 줄바꿈이 글자 단위로 끊기므로 붙여서 잇는다(빠진 띄어쓰기는 FIXES·육안 확인)
    txt = '\n'.join(paras)
    txt = re.sub(r'\s+([,.)])', r'\1', txt)
    for a, b in FIXES:
        txt = txt.replace(a, b)
    return txt

if __name__ == '__main__':
    pdf, name, *want = sys.argv[1:]
    arts = articles(load_lines(pdf))
    res = {}
    for w in want:
        a = arts.get(w)
        if a:
            res[f'{name}|{w}'] = {'title': a['title'], 'text': clean(a['lines'])}
        else:
            print(f'[경고] {w} 없음', file=sys.stderr)
    print(json.dumps(res, ensure_ascii=False, indent=1))
