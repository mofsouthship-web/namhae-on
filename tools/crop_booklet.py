#!/usr/bin/env python3
"""업무수첩(이미지 PDF)의 쪽에서 흰 패널 안쪽 그림만 잘라 JPG로 저장한다.
사용: python3 crop_booklet.py 책자.pdf 쪽 출력.jpg [model|map|full]"""
import sys, subprocess, tempfile, glob, os, shutil
from PIL import Image, ImageChops

BOX = {'model': (0.072, 0.125, 0.928, 0.895), 'map': (0.070, 0.150, 0.930, 0.895), 'full': (0.06, 0.10, 0.94, 0.90)}

def crop(pdf, page, out, mode='model', dpi=220, q=70):
    tmp = tempfile.mkdtemp()
    subprocess.check_call(['pdftoppm', '-r', str(dpi), '-f', str(page), '-l', str(page), '-jpeg', '-jpegopt', 'quality=90', pdf, os.path.join(tmp, 'p')])
    im = Image.open(glob.glob(os.path.join(tmp, 'p*.jpg'))[0]).convert('RGB')
    W, H = im.size; b = BOX[mode] if mode in BOX else tuple(float(x) for x in mode.split(','))
    im = im.crop((int(b[0]*W), int(b[1]*H), int(b[2]*W), int(b[3]*H)))
    # 패널 모서리에 남는 청록색 배경을 흰색으로
    px = im.load(); cw, ch = int(im.width*0.10), int(im.height*0.07)
    for (x0, x1) in ((0, cw), (im.width-cw, im.width)):
        for (y0, y1) in ((0, ch), (im.height-ch, im.height)):
            for x in range(x0, x1):
                for y in range(y0, y1):
                    r, g, bb = px[x, y]
                    if bb > 140 and g > 120 and r < 150 and (g - r) > 35: px[x, y] = (255, 255, 255)
    bg = Image.new('RGB', im.size, (255, 255, 255))
    bb = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 28 else 0).getbbox()
    if bb:
        m = 6; im = im.crop((max(0, bb[0]-m), max(0, bb[1]-m), min(im.width, bb[2]+m), min(im.height, bb[3]+m)))
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    im.save(out, quality=q, optimize=True); shutil.rmtree(tmp)
    return im.size

if __name__ == '__main__':
    pdf, page, out = sys.argv[1:4]
    print(crop(pdf, int(page), out, sys.argv[4] if len(sys.argv) > 4 else 'model'))
