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
    print('OK:', XLSX)


if __name__ == '__main__':
    main()
