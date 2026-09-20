#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2026-09-20: 商標ロゴ統一（本人ルール「商標ロゴでこれからすべて統一」）。
OG画像 public/og-cover.jpg と public/favicon.ico を、商標マスターPNGから再生成する。

  - ロゴは手描きしない。マスター（透過PNG・黒インク）をインクbboxで切り出し、
    インク色を差し替え、中央のリング＋ドット（レティクル）だけサイト青 #1ea0c4 にする。
  - レイアウト・キャンバスサイズ・背景は旧 og-cover.jpg のまま。
    scripts/og/og-cover-base.png ＝ 旧画像から旧ロックアップ（和文「ロケハン3D」）と
    右の大きなマークを背景色で消し、水色 #5ec8e8 を #1ea0c4 に寄せた下地。

使い方:
  python scripts/build-og-images.py [--master <透過PNG>]
  （環境変数 LOCAHUN3D_LOGO_MASTER でも指定可）
  python scripts/build-og-images.py --make-base <旧og-cover.jpg>   # 下地の作り直し（通常不要）
"""
import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MASTER = (
    r"C:\Users\askgg\Dropbox\KWI\Products\Locahun3D\02_資料\ロゴデータ"
    r"\Locahun3D_商標データ_透過.png"
)
BASE = ROOT / "scripts" / "og" / "og-cover-base.png"
OG_OUT = ROOT / "public" / "og-cover.jpg"
ICO_OUT = ROOT / "public" / "favicon.ico"

BLUE = (0x1E, 0xA0, 0xC4)        # サイト青（scan-mark.tsx と同じ）
OLD_BLUE = (0x5E, 0xC8, 0xE8)    # 旧OGの水色
INK_DARK = (0x11, 0x12, 0x14)    # 明背景用インク
INK_LIGHT = (0xFA, 0xFA, 0xF6)   # 暗背景用インク
BG_L = (247, 248, 250)           # OG 左パネル
BG_R = (20, 23, 28)              # OG 右パネル
ICON_BG = (0x0A, 0x0A, 0x0A)     # icon-blue.svg と同じ

# 旧 og-cover.jpg を実測した配置（px）
LOCKUP_BOX = (70, 133, 290, 162)     # 左上の小ロックアップ（幅220を維持）
BIGMARK_BOX = (843, 222, 1028, 407)  # 右パネルの大マーク


def load_master(path):
    im = Image.open(path).convert("RGBA")
    return im.crop(im.split()[-1].getbbox())


def split_mark(lockup):
    """ロックアップ左端のマーク部分（正方形）だけを返す。"""
    alpha = np.asarray(lockup.split()[-1])
    cols = alpha.max(axis=0) > 0
    x = 0
    while x < len(cols) and cols[x]:
        x += 1
    mark = lockup.crop((0, 0, x, lockup.height))
    return mark.crop(mark.split()[-1].getbbox())


def tint(img, ink, mark_w, reticle=BLUE):
    """インク色を差し替え、マーク中央のリング＋ドットだけ reticle 色にする。"""
    a = np.asarray(img).copy()
    h, w = a.shape[:2]
    a[..., 0], a[..., 1], a[..., 2] = ink
    cy, cx = (h - 1) / 2, (mark_w - 1) / 2
    yy, xx = np.mgrid[0:h, 0:w]
    # 半径 0.27×マーク辺 の内側＝リングとドットだけ（ブラケットには届かない）
    m = (xx - cx) ** 2 + (yy - cy) ** 2 < (0.27 * mark_w) ** 2
    a[m, 0], a[m, 1], a[m, 2] = reticle
    return Image.fromarray(a, "RGBA")


def fit(img, box):
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    s = min(bw / img.width, bh / img.height)
    out = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    # 左寄せ・縦中央（正方形マークは箱いっぱいになる）
    return out, (x0, y0 + (bh - out.height) // 2)


def make_base(src):
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    # 旧ロゴを背景色で消す（余白込み）
    x0, y0, x1, y1 = LOCKUP_BOX
    a[y0 - 8:y1 + 8, x0 - 8:x1 + 12] = BG_L
    x0, y0, x1, y1 = BIGMARK_BOX
    a[y0 - 8:y1 + 8, x0 - 8:x1 + 8] = BG_R
    # 水色 → サイト青。背景→旧水色の混合率 t を赤チャンネルから逆算して付け替える
    for xs, bg in ((slice(0, 672), BG_L), (slice(672, 1200), BG_R)):
        reg = a[:, xs]
        bluish = (reg[..., 2] - reg[..., 0]) > 35
        bgv = np.array(bg, np.float32)
        t = np.clip((reg[..., 0] - bgv[0]) / (OLD_BLUE[0] - bgv[0]), 0, 1)[..., None]
        new = bgv + t * (np.array(BLUE, np.float32) - bgv)
        reg[bluish] = new[bluish]
    BASE.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(BASE, optimize=True)
    print("base ->", BASE)


def build_og(lockup):
    im = Image.open(BASE).convert("RGBA")
    mark = split_mark(lockup)
    small, pos = fit(tint(lockup, INK_DARK, mark.width), LOCKUP_BOX)
    im.alpha_composite(small, pos)
    big, pos = fit(tint(mark, INK_LIGHT, mark.width), BIGMARK_BOX)
    im.alpha_composite(big, pos)
    im.convert("RGB").save(OG_OUT, quality=92, optimize=True)
    print("og ->", OG_OUT)


def build_ico():
    """
    アプリアイコン（ロックアップではなくアイコン）。16px でも潰れないよう、
    public/icon-blue.svg ＝ src/components/scan-mark.tsx と同じ座標（viewBox 64）を
    そのまま拡大して描く。旧 favicon.ico はビューアー用の琥珀色レティクルだった。
    """
    k = 16  # 64 → 1024
    S = 64 * k
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=13 * k, fill=ICON_BG + (255,))
    ink = (0xF4, 0xF1, 0xEA, 255)
    w = 5 * k

    def stroke(points):
        pts = [(x * k, y * k) for x, y in points]
        d.line(pts, fill=ink, width=w, joint="curve")
        for x, y in pts:  # round cap / join
            d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=ink)

    stroke([(14, 23), (14, 14), (23, 14)])
    stroke([(41, 14), (50, 14), (50, 23)])
    stroke([(14, 41), (14, 50), (23, 50)])
    stroke([(50, 41), (50, 50), (41, 50)])
    c, blue = 32 * k, BLUE + (255,)
    # SVG: r=7 / stroke 3 → 外径 8.5・内径 5.5
    d.ellipse((c - 8.5 * k, c - 8.5 * k, c + 8.5 * k, c + 8.5 * k), fill=blue)
    d.ellipse((c - 5.5 * k, c - 5.5 * k, c + 5.5 * k, c + 5.5 * k), fill=ICON_BG + (255,))
    d.ellipse((c - 2.4 * k, c - 2.4 * k, c + 2.4 * k, c + 2.4 * k), fill=blue)
    canvas.save(ICO_OUT, sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("ico ->", ICO_OUT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", default=os.environ.get("LOCAHUN3D_LOGO_MASTER", DEFAULT_MASTER))
    ap.add_argument("--make-base", metavar="OLD_OG_JPG")
    args = ap.parse_args()
    if args.make_base:
        make_base(args.make_base)
    if not Path(args.master).exists():
        sys.exit(f"master not found: {args.master}")
    lockup = load_master(args.master)
    build_og(lockup)
    build_ico()


if __name__ == "__main__":
    main()
