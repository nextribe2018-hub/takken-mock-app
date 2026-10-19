import json, sys, os
D = os.path.dirname(__file__)
# (ファイル, id, 表示名, 説明, 参考レベル)
LEVELS = [
  ('jhs',   'toeic500', 'TOEIC 500', '基本語。日常の名詞・動詞・形容詞',           '中学1〜2年／英検5〜4級'),
  ('eiken', 'toeic600', 'TOEIC 600', '高校で習う頻出語',                           '高校基礎／英検準2級〜2級／共通テスト'),
  ('toeic', 'toeic700', 'TOEIC 700', 'ビジネス・職場の頻出語',                     '英検2級／大学中堅（日東駒専）'),
  ('march', 'toeic800', 'TOEIC 800', '難関大・新聞記事レベルの語',                 'MARCH／英検準1級'),
  ('sokei', 'toeic900', 'TOEIC 900', '難語。論説文・学術記事レベル',               '早慶・難関国立／英検1級'),
]
out = []
ok = True
allw = {}
for key, lid, name, desc, ref in LEVELS:
    words = []
    seen = set()
    for ln in open(os.path.join(D, key + '.txt'), encoding='utf-8'):
        ln = ln.strip()
        if not ln: continue
        w, m, pos = ln.split('|')
        if w in seen:
            print(f'[{key}] DUP: {w}'); ok = False
        seen.add(w)
        if w in allw:
            print(f'[{key}] also in {allw[w]}: {w}')
        allw[w] = key
        words.append({'w': w, 'm': m, 'p': pos})
    print(f'{key}: {len(words)}')
    if len(words) != 300: ok = False
    out.append({'id': lid, 'name': name, 'desc': desc, 'ref': ref, 'words': words})
if not ok:
    sys.exit('fix the data')
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print('written', sys.argv[1])
