#!/usr/bin/env python3
"""앱 전체(코드+내용+이미지)를 HTML 파일 하나로 묶는다. 사용: python3 build_single.py <앱 폴더> <출력.html>"""
import sys, os, re, base64, glob, io
from PIL import Image
app, out = sys.argv[1:3]; LIGHT = len(sys.argv) > 3 and sys.argv[3] == 'light'; os.chdir(app)
rd = lambda f: open(f, encoding='utf-8').read()
html, css, js, cont = rd('index.html'), rd('style.css'), rd('app.js'), rd('content.js')
if LIGHT:   # 가벼운 미리보기판: 법령 별표 쪽 이미지는 빼고 법령정보센터 링크로 연결
    import json
    d = json.loads(cont.split('=', 1)[1].strip().rstrip(';')); d['lawBp'] = {}
    cont = 'window.CONTENT = ' + json.dumps(d, ensure_ascii=False) + ';'
def small(p):
    im = Image.open(p).convert('RGB'); big = p.startswith('img/hero') or p.startswith('img/card')
    W = 720 if big else 760
    if im.width > W: im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=58, optimize=True); return b.getvalue()
for p in sorted(glob.glob('img/*.jpg') + (glob.glob('img/law/*.jpg') if not LIGHT else []) + glob.glob('img/geunhae/*.jpg'), key=len, reverse=True):
    u = 'data:image/jpeg;base64,' + base64.b64encode(small(p)).decode()
    js = js.replace(p, u); cont = cont.replace(p, u)
html = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?', '', html)
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
html = html.replace('<script src="app.js"></script>', '<script>window.__INLINE=1;</script>\n<script>' + cont + '</script>\n<script>' + js + '</script>')
open(out, 'w', encoding='utf-8').write(html); print(os.path.getsize(out) // 1024, 'KB')
