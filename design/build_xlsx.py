# デザイン案の Excel（design/デザイン案.xlsx）と、説明文・プライバシーポリシーの Markdown を作る。
#   uv run --with pillow --with openpyxl python design/build_xlsx.py
# - 画像は design/out/（make_assets.py の出力）を貼り付ける
# - 各シートの「修正コメント」列（黄色）に書いた内容は、作り直すと「前回のコメント」列に移る
# - 対応内容は spec.json の "changes" に {ID: "対応内容"} で書くと「対応状況」列に出る
import io
import json
import os

from openpyxl import Workbook, load_workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
XLSX = os.path.join(HERE, 'デザイン案.xlsx')
SPEC = json.load(open(os.path.join(HERE, 'spec.json'), encoding='utf-8'))
TEXT = json.load(open(os.path.join(HERE, 'text.json'), encoding='utf-8'))
CHANGES = SPEC.get('changes', {})

F = 'Arial'
HEAD_FILL = PatternFill('solid', fgColor='1F3A5F')
INPUT_FILL = PatternFill('solid', fgColor='FFF2A8')
THIN = Side(style='thin', color='C8C8C8')
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical='top')
COMMENT_HEAD = '修正コメント（ここに記入）'


def old_comments():
    """前の Excel から {(シート名, ID): コメント} を読む。"""
    if not os.path.exists(XLSX):
        return {}
    out = {}
    wb = load_workbook(XLSX)
    for ws in wb.worksheets:
        head = [c.value for c in ws[1]]
        if COMMENT_HEAD not in head or 'ID' not in head:
            continue
        ci, ii = head.index(COMMENT_HEAD), head.index('ID')
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row[ii] and row[ci]:
                out[(ws.title, str(row[ii]))] = str(row[ci])
    return out


OLD = old_comments()


def header(ws, cols):
    for i, (name, width) in enumerate(cols, 1):
        c = ws.cell(1, i, name)
        c.font = Font(name=F, bold=True, color='FFFFFF')
        c.fill = INPUT_FILL if name == COMMENT_HEAD else HEAD_FILL
        if name == COMMENT_HEAD:
            c.font = Font(name=F, bold=True, color='000000')
        c.alignment = Alignment(wrap_text=True, vertical='center')
        c.border = BOX
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.freeze_panes = 'A2'
    ws.row_dimensions[1].height = 30


def row(ws, r, values, height, comment_col):
    for i, v in enumerate(values, 1):
        c = ws.cell(r, i, v)
        c.font = Font(name=F, size=10)
        c.alignment = WRAP
        c.border = BOX
        if i == comment_col:
            c.fill = INPUT_FILL
    ws.row_dimensions[r].height = height


def put_image(ws, path, anchor, w):
    im = Image.open(path)
    h = round(im.height * w / im.width)
    buf = io.BytesIO()
    im.convert('RGB').resize((w * 2, h * 2), Image.LANCZOS).save(buf, 'PNG')
    xl = XLImage(buf)
    xl.width, xl.height = w, h
    ws.add_image(xl, anchor)
    return h


def status(sheet, id_):
    return CHANGES.get(id_, '')


def sheet_guide(wb):
    ws = wb.active
    ws.title = '使い方'
    lines = [
        ('宅建10分模試 デザイン・ストア掲載案', True),
        (f'版：v{SPEC["version"]}（作り直すたびに上がります）', False),
        ('', False),
        ('書き方', True),
        ('1. 各シートの黄色い列「修正コメント（ここに記入）」に、直したい点を書いて保存してください。', False),
        ('2. Claude に「コメントを読み込んで修正して」と伝えると、design/read_feedback.py でコメントを読み、案を作り直します。', False),
        ('3. 作り直した Excel では、前のコメントは「前回のコメント」列に移り、「対応状況」列に何を直したかが入ります。', False),
        ('4. 案ごとの行のほか、各シートの「全体」行には、案をまたいだ意見（例：色の方向性）を書けます。', False),
        ('', False),
        ('コメントの例', True),
        ('アイコン案 I1 →「金色の弧をもう少し太く。『宅建』の文字は少し小さく」', False),
        ('スクショ案 A-1 →「見出しを『毎日10分、10問だけ。』に変更」', False),
        ('説明文 T5 →「『こんな方に』の項目に“独学の方”を追加」', False),
        ('', False),
        ('シート', True),
        ('アイコン案：5案（1024×1024）。どれか1つ、または組み合わせを選んでください', False),
        ('スクショ案：3つの色の方向（A・B・C）× 6枚。実際のアプリ画面を使っています', False),
        ('説明文：App Store Connect に入れる文章。文字数は自動で数えます', False),
        ('プライバシーポリシー：icurate.jp に載せる文章の案', False),
        ('競合参考：他社の宅建アプリの傾向（画像は載せず、言葉で説明。リンクから実物を確認できます）', False),
        ('', False),
        ('注意', True),
        ('・他社の画像や文章はそのまま使いません。構成や傾向の参考だけにしています', False),
        ('・「合格保証」など誇大な表現は使いません', False),
        ('・アイコン・スクショの文字は macOS 標準フォント（ヒラギノ角ゴシック、凸版文久見出し明朝）で描いています', False),
    ]
    for i, (t, b) in enumerate(lines, 1):
        c = ws.cell(i, 1, t)
        c.font = Font(name=F, bold=b, size=14 if i == 1 else 11)
    ws.column_dimensions['A'].width = 120


def sheet_icons(wb):
    ws = wb.create_sheet('アイコン案')
    cols = [('ID', 8), ('画像', 26), ('案の名前', 18), ('ねらい', 48), (COMMENT_HEAD, 40), ('前回のコメント', 30), ('対応状況', 30)]
    header(ws, cols)
    r = 2
    for ic in SPEC['icons']:
        row(ws, r, [ic['id'], '', ic['name'], ic['intent'], '', OLD.get((ws.title, ic['id']), ''), status(ws.title, ic['id'])], 140, 5)
        put_image(ws, os.path.join(HERE, 'out', 'icons', f"{ic['id']}.png"), f'B{r}', 170)
        r += 1
    row(ws, r, ['全体', '', '（案をまたいだ意見）', '色の方向性・文字の大きさなど、全体への意見はこの行に', '', OLD.get((ws.title, '全体'), ''), status(ws.title, '全体')], 40, 5)


def sheet_shots(wb):
    ws = wb.create_sheet('スクショ案')
    cols = [('ID', 8), ('画像', 22), ('色の方向', 22), ('見出し', 24), ('サブ見出し', 26), ('使う画面', 12), (COMMENT_HEAD, 36), ('前回のコメント', 28), ('対応状況', 28)]
    header(ws, cols)
    screen_name = {'exam': '問題', 'instant': '即時解説', 'lesson': '論点の解説', 'home': 'ホーム', 'map': '論点マップ', 'free': '無料版の案内', 'result': '結果', 'pass': '合格の見込み'}
    r = 2
    for st in SPEC['screenshot_sets']:
        sid = f"{st['id']}-全体"
        row(ws, r, [sid, '', st['name'], '（このセット全体への意見）', '', '', '', OLD.get((ws.title, sid), ''), status(ws.title, sid)], 34, 7)
        ws.cell(r, 1).font = Font(name=F, size=10, bold=True)
        r += 1
        for sl in SPEC['slides']:
            id_ = f"{st['id']}-{sl['no']}"
            row(ws, r, [id_, '', st['name'], sl['head'], sl['sub'], screen_name.get(sl['screen'], sl['screen']), '', OLD.get((ws.title, id_), ''), status(ws.title, id_)], 250, 7)
            put_image(ws, os.path.join(HERE, 'out', 'screenshots', f'{id_}.png'), f'B{r}', 150)
            r += 1


def sheet_listing(wb):
    ws = wb.create_sheet('説明文')
    cols = [('ID', 6), ('項目', 18), ('案', 70), ('文字数', 8), ('上限', 8), ('メモ', 28), (COMMENT_HEAD, 36), ('前回のコメント', 26), ('対応状況', 26)]
    header(ws, cols)
    for r, t in enumerate(TEXT['listing'], 2):
        lines = t['text'].count('\n') + 1
        row(ws, r, [t['id'], t['field'], t['text'], f'=LEN(C{r})', t['limit'] or '—', t['note'], '', OLD.get((ws.title, t['id']), ''), status(ws.title, t['id'])], max(30, min(409, 15 * max(lines, len(t['text']) // 45 + 1))), 7)
    n = len(TEXT['listing']) + 2
    ws.cell(n + 1, 2, '文字数は Excel の LEN 関数で数えています（改行も1文字）。上限を超えたら赤字にしてください').font = Font(name=F, size=9, italic=True)


def sheet_privacy(wb):
    ws = wb.create_sheet('プライバシーポリシー')
    cols = [('ID', 6), ('見出し', 24), ('本文', 80), (COMMENT_HEAD, 36), ('前回のコメント', 26), ('対応状況', 26)]
    header(ws, cols)
    pv = TEXT['privacy']
    row(ws, 2, ['P0', pv['title'], pv['intro'], '', OLD.get((ws.title, 'P0'), ''), status(ws.title, 'P0')], 60, 4)
    for r, s in enumerate(pv['sections'], 3):
        row(ws, r, [s['id'], s['head'], s['body'], '', OLD.get((ws.title, s['id']), ''), status(ws.title, s['id'])], max(30, 15 * (len(s['body']) // 55 + 1 + s['body'].count('\n'))), 4)


def sheet_competitors(wb):
    ws = wb.create_sheet('競合参考')
    cols = [('アプリ', 26), ('開発元', 18), ('価格', 24), ('評価', 14), ('アイコンの特徴', 36), ('スクショの構成', 40), ('参考になる点', 32), ('App Store', 30)]
    header(ws, cols)
    for r, c in enumerate(TEXT['competitors'], 2):
        row(ws, r, [c['app'], c['dev'], c['price'], c['rating'], c['icon'], c['shots'], c['hint'], c['url']], 75, 0)
        ws.cell(r, 8).hyperlink = c['url']
        ws.cell(r, 8).font = Font(name=F, size=10, color='0563C1', underline='single')
    r = len(TEXT['competitors']) + 3
    ws.cell(r, 1, '傾向のまとめ（2026-10-17 調査。評価・価格は閲覧時点の値）').font = Font(name=F, bold=True)
    for i, t in enumerate(TEXT['trends'], 1):
        ws.cell(r + i, 1, '・' + t).font = Font(name=F, size=10)


def write_markdown():
    L = ['# App Store 掲載文（案）', '', '`design/text.json` から自動生成（`design/build_xlsx.py`）。修正は text.json か Excel のコメントで。', '']
    for t in TEXT['listing']:
        lim = f'（{len(t["text"])}／{t["limit"]}字）' if t['limit'] else ''
        L += [f'## {t["field"]}{lim}', '', t['text'], '']
    open(os.path.join(ROOT, 'docs', 'store-listing.md'), 'w', encoding='utf-8').write('\n'.join(L))
    pv = TEXT['privacy']
    P = [f'# {pv["title"]}', '', '> 下書き（`design/text.json` から自動生成）。公開前に所在地・制定日を確定し、icurate.jp に掲載する。法的な最終確認は専門家に依頼する。', '', pv['intro'], '']
    for s in pv['sections']:
        P += [f'## {s["head"]}', '', s['body'].replace('\n', '  \n'), '']
    open(os.path.join(ROOT, 'docs', 'privacy-policy.md'), 'w', encoding='utf-8').write('\n'.join(P))


def write_store_config():
    """EAS Metadata 用（npx eas-cli metadata:push）。スクショと App のプライバシーは対象外なので手で入れる。"""
    t = {x['id']: x['text'] for x in TEXT['listing']}
    cfg = {
        'configVersion': 0,
        'apple': {
            'copyright': '2026 iCurate Co.,Ltd',
            'categories': ['EDUCATION', 'REFERENCE'],
            'info': {'ja': {
                'title': t['T1'], 'subtitle': t['T2'], 'promoText': t['T3'],
                'keywords': t['T4'].split(','), 'description': t['T5'], 'releaseNotes': t['T6'],
                'supportUrl': t['T7'], 'privacyPolicyUrl': t['T8'],
            }},
            'advisory': {k: 'NONE' for k in [
                'alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'horrorOrFearThemes',
                'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor',
                'sexualContentGraphicAndNudity', 'sexualContentOrNudity', 'violenceCartoonOrFantasy',
                'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic']} | {
                'gambling': False, 'unrestrictedWebAccess': False, 'seventeenPlus': False,
                'kidsAgeBand': None, 'ageRatingOverride': 'NONE', 'koreaAgeRatingOverride': 'NONE'},
            'release': {'automaticRelease': False, 'phasedRelease': False},
            'review': TEXT['review'],
        },
    }
    open(os.path.join(ROOT, 'store.config.json'), 'w', encoding='utf-8').write(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def write_wp_pages():
    """WordPress の固定ページに「カスタムHTML」ブロックで貼る本文（docs/web/）。"""
    import html
    os.makedirs(os.path.join(ROOT, 'docs', 'web'), exist_ok=True)
    esc = lambda x: html.escape(x).replace('\n', '<br>')
    pv = TEXT['privacy']
    P = [f'<h2>{esc(pv["title"])}</h2>', f'<p>{esc(pv["intro"])}</p>']
    for s in pv['sections']:
        P += [f'<h3>{esc(s["head"])}</h3>', f'<p>{esc(s["body"])}</p>']
    open(os.path.join(ROOT, 'docs', 'web', 'privacy.html'), 'w', encoding='utf-8').write('\n'.join(P) + '\n')
    S = ['<h2>宅建10分模試 サポート</h2>',
         '<p>iPhone アプリ「宅建10分模試」のお問い合わせ・よくある質問のページです。</p>',
         '<h3>お問い合わせ</h3>',
         '<p>不具合のご報告、問題や解説の誤りのご指摘、ご意見は、次のメールアドレスまでお送りください。<br>'
         '<a href="mailto:info@icurate.jp?subject=%E5%AE%85%E5%BB%BA10%E5%88%86%E6%A8%A1%E8%A9%A6">info@icurate.jp</a><br>'
         '件名に「宅建10分模試」と入れ、可能であれば iPhone の機種・iOS のバージョン・問題の出典（例：R06-38-1）をお書きください。</p>',
         '<h3>よくある質問</h3>',
         '<p><strong>Q. 全問解放を購入したのに、無料版のままです。</strong><br>A. ホーム画面の「購入を復元」を押してください。購入したときと同じ Apple ID でサインインしている必要があります。</p>',
         '<p><strong>Q. 機種変更をしたら学習記録は引き継げますか？</strong><br>A. 学習記録は端末の中だけに保存しているため、現在は引き継げません。全問解放は「購入を復元」で新しい端末でも使えます。</p>',
         '<p><strong>Q. 月額料金はかかりますか？</strong><br>A. かかりません。全問解放は400円の買い切りです。</p>',
         '<p><strong>Q. 学習記録を消したい。</strong><br>A. ホーム画面の下にある「学習記録をすべて消す」で消せます。アプリを削除しても消えます。</p>',
         '<h3>ご注意</h3>',
         '<p>本アプリは個人学習用の非公式教材で、試験の実施機関とは関係ありません。法令は改正されることがあります。最新の情報は公式資料でご確認ください。</p>',
         '<p>運営：株式会社iCurate</p>']
    open(os.path.join(ROOT, 'docs', 'web', 'support.html'), 'w', encoding='utf-8').write('\n'.join(S) + '\n')


SITE_CSS = """
:root{--bg:#f6f7f5;--paper:#fff;--ink:#1d2730;--muted:#5c6770;--line:#d9ddd7;--navy:#1f3a5f;--gold:#c98f1c}
@media (prefers-color-scheme:dark){:root{--bg:#12171c;--paper:#1a2128;--ink:#e6eaed;--muted:#9aa6af;--line:#2c3640;--navy:#8fb2da;--gold:#e7b54e;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Zen Kaku Gothic New","Hiragino Sans","Yu Gothic",sans-serif;line-height:1.85;font-size:16px}
.wrap{max-width:760px;margin:0 auto;padding:28px 18px 64px}
header.site{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:28px}
header.site a{color:var(--ink);text-decoration:none}.brand{font-weight:700;letter-spacing:.04em}.brand small{color:var(--muted);font-weight:400;margin-left:8px}
h1{font-family:"Shippori Mincho B1","Hiragino Mincho ProN",serif;font-weight:800;font-size:1.7rem;line-height:1.35;margin:0 0 12px;color:var(--navy)}
h2{font-size:1.1rem;margin:28px 0 6px}h3{font-size:1rem;margin:20px 0 4px}p{margin:0 0 10px}
a{color:var(--navy)}.muted{color:var(--muted);font-size:.9rem}
.app{display:grid;grid-template-columns:96px 1fr;gap:16px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px}
.app img{width:96px;height:96px;border-radius:22px}.links{display:flex;gap:14px;flex-wrap:wrap;font-size:.92rem}
footer{margin-top:48px;border-top:1px solid var(--line);padding-top:14px;color:var(--muted);font-size:.85rem}
"""


def write_site():
    """apps.icurate.jp（学習アプリ事業）の静的サイト。site/ をそのままサーバーの公開フォルダに上げる。"""
    import html as H
    import shutil
    from PIL import Image as PImage
    root = os.path.join(ROOT, 'site')
    os.makedirs(os.path.join(root, 'takken', 'privacy'), exist_ok=True)
    os.makedirs(os.path.join(root, 'takken', 'support'), exist_ok=True)
    PImage.open(os.path.join(HERE, 'out', 'icons', 'I4.png')).convert('RGB').resize((256, 256), PImage.LANCZOS).save(os.path.join(root, 'takken', 'icon.png'))
    open(os.path.join(root, 'style.css'), 'w', encoding='utf-8').write(SITE_CSS.strip() + '\n')

    def page(path, title, body, depth):
        up = '../' * depth
        doc = f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{H.escape(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap">
<link rel="stylesheet" href="{up}style.css"></head>
<body><div class="wrap">
<header class="site"><a class="brand" href="{up}">iCurate Apps<small>学習アプリ</small></a><a class="muted" href="https://icurate.jp/">株式会社iCurate</a></header>
{body}
<footer>© 2026 株式会社iCurate　〒108-0075 東京都港区港南3-5-10-2902　<a href="mailto:info@icurate.jp">info@icurate.jp</a></footer>
</div></body></html>
"""
        open(os.path.join(root, path), 'w', encoding='utf-8').write(doc)

    esc = lambda x: H.escape(x).replace('\n', '<br>')
    t = {x['id']: x['text'] for x in TEXT['listing']}
    page('index.html', 'iCurate Apps｜学習アプリ', f"""<h1>学習アプリ</h1>
<p>株式会社iCurate が提供する、スキマ時間で学べる iPhone アプリです。</p>
<div class="app"><img src="takken/icon.png" alt="宅建10分模試のアイコン"><div>
<h2 style="margin:0">宅建10分模試</h2><p class="muted">{H.escape(t['T2'])}</p>
<div class="links"><a href="takken/support/">サポート</a><a href="takken/privacy/">プライバシーポリシー</a></div></div></div>""", 0)
    pv = TEXT['privacy']
    body = f'<h1>{H.escape(pv["title"])}</h1><p>{esc(pv["intro"])}</p>' + ''.join(f'<h2>{H.escape(s["head"])}</h2><p>{esc(s["body"])}</p>' for s in pv['sections'])
    page(os.path.join('takken', 'privacy', 'index.html'), pv['title'], body, 2)
    sup = open(os.path.join(ROOT, 'docs', 'web', 'support.html'), encoding='utf-8').read().replace('<h3>', '<h2>').replace('</h3>', '</h2>').replace('<h2>宅建10分模試 サポート</h2>', '<h1>宅建10分模試 サポート</h1>', 1)
    page(os.path.join('takken', 'support', 'index.html'), '宅建10分模試 サポート', sup, 2)


def main():
    wb = Workbook()
    sheet_guide(wb)
    sheet_icons(wb)
    sheet_shots(wb)
    sheet_listing(wb)
    sheet_privacy(wb)
    sheet_competitors(wb)
    wb.calculation.fullCalcOnLoad = True
    wb.save(XLSX)
    write_markdown()
    write_store_config()
    write_wp_pages()
    write_site()
    print('OK:', XLSX)


if __name__ == '__main__':
    main()
