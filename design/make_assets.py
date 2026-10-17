# アイコン案とストア用スクリーンショット案を spec.json から作る。
#   uv run --with pillow python design/make_assets.py
# 出力：design/out/icons/<ID>.png（1024×1024・透過なし）
#       design/out/screenshots/<セット>-<番号>.png（1290×2796＝6.9インチ iPhone 用）
# 元のアプリ画面は design/screens/*.png（design/capture/capture.mjs で Web 版から撮影）。
import glob
import json
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = json.load(open(os.path.join(HERE, 'spec.json'), encoding='utf-8'))
PAL = SPEC['palette']
OUT_I = os.path.join(HERE, 'out', 'icons')
OUT_S = os.path.join(HERE, 'out', 'screenshots')


def col(name):
    h = PAL.get(name, name).lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


# ---- フォント（macOS 標準。見つからなければ近いものに切り替える） ----
def _first(patterns):
    for p in patterns:
        hit = sorted(glob.glob(p))
        if hit:
            return hit[0]
    raise FileNotFoundError(patterns)


GOTHIC = {w: _first([f'/System/Library/Fonts/ヒラギノ角ゴシック W{w}.ttc']) for w in (3, 6, 8)}
MINCHO = _first([
    '/System/Library/AssetsV2/*/*/AssetData/ToppanBunkyuMidashiMinchoStdN-ExtraBold.otf',
    '/System/Library/AssetsV2/*/*/AssetData/YuMincho.ttc',
    '/System/Library/Fonts/ヒラギノ明朝 ProN.ttc',
])


def font(kind, size):
    return ImageFont.truetype(MINCHO if kind == 'mincho' else GOTHIC[kind], size)


def text_c(d, xy, s, f, fill, anchor='mm', spacing=0.25):
    """中央ぞろえで描く（改行あり）。"""
    d.multiline_text(xy, s, font=f, fill=fill, anchor=anchor, align='center', spacing=int(f.size * spacing))


def fit(kind, s, max_w, size):
    while size > 20:
        f = font(kind, size)
        w = max(f.getlength(line) for line in s.split('\n'))
        if w <= max_w:
            return f
        size -= 4
    return font(kind, size)


# ---- アイコン（2048で描いて1024に縮小＝なめらかにする） ----
S = 2048


def icon_timer_ring(ic):
    im = Image.new('RGB', (S, S), col(ic['bg']))
    d = ImageDraw.Draw(im)
    cx, cy, r, w = S // 2, 930, 660, 72
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=mix(col(ic['bg']), col('white'), 0.16), width=w)
    a0, a1 = -90, -30  # 60分のうち10分
    d.arc([cx - r, cy - r, cx + r, cy + r], a0, a1, fill=col(ic['accent']), width=w)
    for a in (a0, a1):  # 丸い端
        x, y = cx + (r - w / 2) * math.cos(math.radians(a)), cy + (r - w / 2) * math.sin(math.radians(a))
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col(ic['accent']))
    text_c(d, (cx, cy - 10), ic['main'], font(8, 500), col(ic['fg']))
    text_c(d, (cx, 1790), ic['sub'], font(6, 190), col(ic['accent']))
    return im


def icon_ox_blocks(ic):
    im = Image.new('RGB', (S, S), col(ic['bg']))
    d = ImageDraw.Draw(im)
    text_c(d, (S // 2, 640), ic['main'], font(8, 600), col(ic['fg']))
    y0, sz, gap = 1080, 680, 90
    x0 = (S - (sz * 2 + gap)) // 2
    for k, (c, mark) in enumerate([(col('green'), 'o'), (col(ic['accent']), 'x')]):
        x = x0 + k * (sz + gap)
        d.rounded_rectangle([x, y0, x + sz, y0 + sz], radius=120, fill=c)
        m, lw = 170, 84
        if mark == 'o':
            d.ellipse([x + m, y0 + m, x + sz - m, y0 + sz - m], outline=col('white'), width=lw)
        else:
            for a, b in (((x + m, y0 + m), (x + sz - m, y0 + sz - m)), ((x + sz - m, y0 + m), (x + m, y0 + sz - m))):
                d.line([a, b], fill=col('white'), width=lw)
                for p in (a, b):
                    d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=col('white'))
    return im


def icon_stopwatch(ic):
    im = Image.new('RGB', (S, S), col(ic['bg']))
    d = ImageDraw.Draw(im)
    cx, cy, r = S // 2, 1130, 720
    white = col('white')
    d.rounded_rectangle([cx - 130, 240, cx + 130, 360], radius=40, fill=white)  # つまみ
    d.rectangle([cx - 50, 340, cx + 50, cy - r + 30], fill=white)
    a = math.radians(-45)  # 横のボタン
    bx, by = cx + (r + 40) * math.cos(a), cy + (r + 40) * math.sin(a)
    btn = Image.new('L', (S, S), 0)
    ImageDraw.Draw(btn).rounded_rectangle([bx - 70, by - 90, bx + 70, by + 90], radius=30, fill=255)
    btn = btn.rotate(-45, center=(bx, by))
    im.paste(white, mask=btn)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=white)
    text_c(d, (cx, cy - 300), ic['main'], font(8, 230), col(ic['accent']))
    fb, fs = font(8, 560), font(8, 190)  # 「10」と小さい「分」を並べて中央に
    wb, ws = fb.getlength(ic['sub']), fs.getlength('分')
    x = cx - (wb + 20 + ws) / 2
    d.text((x, cy + 330), ic['sub'], font=fb, fill=col(ic['bg']), anchor='ls')
    d.text((x + wb + 20, cy + 330), '分', font=fs, fill=col(ic['bg']), anchor='ls')
    return im


def icon_roof(ic):
    top, bot = mix(col(ic['bg']), col('white'), 0.12), col(ic['bg'])
    im = Image.new('RGB', (S, S))
    d = ImageDraw.Draw(im)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=mix(top, bot, y / S))
    w = 110
    pts = [(360, 860), (S // 2, 330), (S - 360, 860)]
    d.rectangle([1390, 430, 1500, 700], fill=col(ic['fg']))  # 煙突（屋根の線の下に隠れるよう先に描く）
    d.line(pts, fill=col(ic['fg']), width=w, joint='curve')
    for p in (pts[0], pts[2]):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=col(ic['fg']))
    text_c(d, (S // 2, 1150), ic['main'], font(8, 560), col(ic['fg']))
    d.rectangle([0, 1560, S, S], fill=col(ic['accent']))
    text_c(d, (S // 2, 1800), ic['sub'], font(8, 270), col(ic['bg']))
    return im


def icon_book(ic):
    im = Image.new('RGB', (S, S), col(ic['bg']))
    d = ImageDraw.Draw(im)
    navy = col(ic['fg'])
    d.rectangle([110, 110, S - 110, S - 110], outline=navy, width=48)
    d.rectangle([200, 200, S - 200, S - 200], outline=navy, width=12)
    text_c(d, (S // 2, 820), ic['main'], font('mincho', 720), navy)
    d.line([(560, 1270), (S - 560, 1270)], fill=navy, width=14)
    st = 560
    stamp = Image.new('RGB', (st, st), col(ic['accent']))
    sd = ImageDraw.Draw(stamp)
    sd.rectangle([30, 30, st - 30, st - 30], outline=col('white'), width=16)
    text_c(sd, (st // 2, st // 2 + 10), ic['sub'], font(8, 230), col('white'))
    stamp = stamp.rotate(-6, expand=True, fillcolor=col(ic['bg']), resample=Image.BICUBIC)
    im.paste(stamp, (S // 2 - stamp.width // 2, 1360))
    return im


ICON_STYLES = {
    'timer_ring': icon_timer_ring, 'ox_blocks': icon_ox_blocks, 'stopwatch': icon_stopwatch,
    'roof': icon_roof, 'book': icon_book,
}


# ---- スクリーンショット ----
W, H = 1290, 2796


def phone(screen_path, width):
    """アプリ画面に黒い端末の枠と角丸を付ける。"""
    sc = Image.open(screen_path).convert('RGB')
    bez = 34
    sw = width - bez * 2
    sc = sc.resize((sw, round(sc.height * sw / sc.width)), Image.LANCZOS)
    ph = Image.new('RGBA', (width, sc.height + bez * 2), (0, 0, 0, 0))
    ImageDraw.Draw(ph).rounded_rectangle([0, 0, ph.width - 1, ph.height - 1], radius=150, fill=(18, 18, 20, 255))
    m = Image.new('L', sc.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, sc.width - 1, sc.height - 1], radius=118, fill=255)
    ph.paste(sc, (bez, bez), m)
    return ph


def shot(st, sl):
    bg = col(st['bg'])
    im = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(im)
    head, sub = sl['head'], sl['sub']
    if st['style'] == 'light':
        fh = fit('mincho', head, W - 160, 128)
    else:
        fh = fit(8, head, W - 160, 118)
    lines = head.count('\n') + 1
    hy = 250 + (lines - 1) * fh.size * 0.6
    text_c(d, (W // 2, hy), head, fh, col(st['head']))
    sy = hy + lines * fh.size * 0.62 + 120
    if st['style'] == 'band':  # サブ見出しを色帯に
        fs = fit(6, sub, W - 280, 58)
        tw = fs.getlength(sub)
        d.rounded_rectangle([W / 2 - tw / 2 - 50, sy - 60, W / 2 + tw / 2 + 50, sy + 60], radius=60, fill=col(st['subc']))
        text_c(d, (W // 2, sy), sub, fs, col('white'))
    else:
        text_c(d, (W // 2, sy), sub, fit(6, sub, W - 160, 60), col(st['subc']))
    ph = phone(os.path.join(HERE, 'screens', sl['screen'] + '.png'), 1040)
    top = int(sy + 150)
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))  # 影
    ImageDraw.Draw(sh).rounded_rectangle([(W - ph.width) / 2 + 10, top + 40, (W + ph.width) / 2 + 10, top + ph.height + 40], radius=150, fill=(0, 0, 0, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(40))
    im.paste(sh, (0, 0), sh)
    im.paste(ph, ((W - ph.width) // 2, top), ph)
    return im


def main():
    os.makedirs(OUT_I, exist_ok=True)
    os.makedirs(OUT_S, exist_ok=True)
    for ic in SPEC['icons']:
        im = ICON_STYLES[ic['style']](ic).resize((1024, 1024), Image.LANCZOS)
        im.save(os.path.join(OUT_I, f"{ic['id']}.png"))
        print('icon', ic['id'])
    for st in SPEC['screenshot_sets']:
        for sl in SPEC['slides']:
            shot(st, sl).save(os.path.join(OUT_S, f"{st['id']}-{sl['no']}.png"))
        print('screenshots', st['id'])


if __name__ == '__main__':
    main()
