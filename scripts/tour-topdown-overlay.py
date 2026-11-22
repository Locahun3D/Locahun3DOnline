# tour-topdown.mjs の真上の図に 1m 方眼・5m ごとの座標・開始位置・今の地点を描く（2026-11-23）
#   python scripts/tour-topdown-overlay.py <name>   （artifacts/topdown/<name>_raw.png と <name>.json を読む）
#   出力: <name>_mark.png（本人が点を打つ用: 方眼＋開始位置だけ） / <name>_now.png（今の地点つき）
import json, sys, math
from PIL import Image, ImageDraw, ImageFont
D = 'F:/Codex/viewerfix/artifacts/topdown/'
name = sys.argv[1]
info = json.load(open(D + name + '.json', encoding='utf-8'))
base = Image.open(D + name + '_raw.png').convert('RGB')
W = base.width
ppm = info['ppm'] * W / info['px']
cx, cz = info['center']['x'], info['center']['z']
def uv(x, z): return (W / 2 + (x - cx) * ppm, W / 2 + (z - cz) * ppm)
try:
    F = ImageFont.truetype('C:/Windows/Fonts/meiryob.ttc', max(14, W // 80))
    FS = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc', max(11, W // 110))
except Exception:
    F = FS = ImageFont.load_default()

def grid(img):
    o = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(o)
    x0 = math.floor(cx - W / 2 / ppm); x1 = math.ceil(cx + W / 2 / ppm)
    z0 = math.floor(cz - W / 2 / ppm); z1 = math.ceil(cz + W / 2 / ppm)
    for x in range(x0, x1 + 1):
        u, _ = uv(x, 0); major = x % 5 == 0
        d.line([(u, 0), (u, W)], fill=(255, 255, 255, 110 if major else 40), width=2 if major else 1)
        if major: d.text((u + 3, 3), f'x{x}', font=FS, fill=(255, 255, 255, 230))
    for z in range(z0, z1 + 1):
        _, v = uv(0, z); major = z % 5 == 0
        d.line([(0, v), (W, v)], fill=(255, 255, 255, 110 if major else 40), width=2 if major else 1)
        if major: d.text((3, v + 2), f'z{z}', font=FS, fill=(255, 255, 255, 230))
    # 縮尺
    u0, v0 = 30, W - 40; d.rectangle([u0, v0, u0 + 5 * ppm, v0 + 8], fill=(255, 255, 255, 230)); d.text((u0, v0 - 26), '5 m', font=F, fill=(255, 255, 255, 255))
    return Image.alpha_composite(img.convert('RGBA'), o)

def start_mark(img):
    d = ImageDraw.Draw(img); s = info['start']; u, v = uv(s['x'], s['z']); r = max(10, W // 120)
    d.ellipse([u - r, v - r, u + r, v + r], fill=(255, 180, 84, 255), outline=(0, 0, 0, 255), width=2)
    yaw = s.get('yaw', 0); L = r * 2.6
    d.line([(u, v), (u + math.sin(yaw) * L, v + math.cos(yaw) * L)], fill=(255, 180, 84, 255), width=4)
    d.text((u + r + 4, v - r - 4), '開始', font=F, fill=(255, 180, 84, 255), stroke_width=3, stroke_fill=(0, 0, 0))
    return img

mark = start_mark(grid(base))
mark.convert('RGB').save(D + name + '_mark.png')
now = mark.copy(); d = ImageDraw.Draw(now); r = max(8, W // 150)
for n in info['nodes']:
    u, v = uv(n['x'], n['z'])
    d.ellipse([u - r, v - r, u + r, v + r], fill=(60, 160, 255, 255), outline=(255, 255, 255, 255), width=2)
    d.text((u + r + 2, v - r - 2), n['id'].lstrip('n'), font=FS, fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))
now.convert('RGB').save(D + name + '_now.png')
print(D + name + '_mark.png', D + name + '_now.png')
