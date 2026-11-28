#!/usr/bin/env python3
"""日本史○×の問題・解説を取り込む: python3 scripts/nihonshi-merge.py [--keep] [--dry-run] [--src 読み込むフォルダ]

content-work/nihonshi/<分野>.items.json（問題の配列）と <分野>.lessons.json（{"分野|論点": 解説}）を
古代・中世・近世・近代・現代・文化の順に読み、検査して
  src/data/nihonshi-ox.json       … 分野の順 → ref の順に並べた問題
  src/data/nihonshi-lessons.json  … 分野の順 → 論点の順（仕様の表の順）に並べた解説
を書き出す。分野・論点・ref の頭文字は src/data/nihonshi-config.json（仕様 docs/content/nihonshi-ox-spec.md §2〜6）。

- ファイルがない分野は警告して飛ばす（--keep を付けると、その分野は今の src/data の内容を残す）
- 解説がない論点は「準備中」の仮の解説で埋める（論点マップを表示するため）。警告を出す
- 検査で誤りがあれば何も書かずに終了コード1。警告（解説の字数・×の割合など）は書き出しを止めない
"""
import json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
cfg = json.loads((root / "src/data/nihonshi-config.json").read_text(encoding="utf-8"))
src = pathlib.Path(sys.argv[sys.argv.index("--src") + 1]).resolve() if "--src" in sys.argv else root / "content-work/nihonshi"
out_items = root / "src/data/nihonshi-ox.json"
out_lessons = root / "src/data/nihonshi-lessons.json"
KEEP = "--keep" in sys.argv
DRY = "--dry-run" in sys.argv

FIELDS = [F["f"] for F in cfg["fields"]]
PREFIX = {F["f"]: F["ref"] for F in cfg["fields"]}
TOPICS = {F["f"]: F["topics"] for F in cfg["fields"]}
ALL_TOPICS = [f"{F['f']}|{t}" for F in cfg["fields"] for t in F["topics"]]
ITEM_KEYS = {"f", "t", "ref", "lv", "s", "a", "e", "m"}
ITEM_OPT = {"y", "g", "w"}
GENRES = cfg.get("genres", {})

errors, warns = [], []
err = errors.append
warn = warns.append


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(f"{path.name}: JSON として読めない（{e}）")
        return None


def check_item(q, fname, i):
    at = f"{fname}[{i}]"
    if not isinstance(q, dict):
        err(f"{at}: オブジェクトでない"); return False
    miss = ITEM_KEYS - q.keys()
    extra = q.keys() - ITEM_KEYS - ITEM_OPT
    if miss: err(f"{at}: キーがない {sorted(miss)}")
    if extra: err(f"{at}: 余分なキー {sorted(extra)}")
    if miss: return False
    at = f"{fname} {q.get('ref')}"
    if q["f"] not in PREFIX: err(f"{at}: 分野 f が仕様にない「{q['f']}」"); return False
    if q["t"] not in TOPICS[q["f"]]: err(f"{at}: 論点 t が「{q['f']}」の論点にない「{q['t']}」")
    if not isinstance(q["ref"], str) or not re.fullmatch(rf"{PREFIX[q['f']]}-\d{{4}}", q["ref"]):
        err(f"{at}: ref は {PREFIX[q['f']]}-0001 の形（分野「{q['f']}」）")
    if q["lv"] not in (1, 2, 3) or isinstance(q["lv"], bool): err(f"{at}: lv は 1／2／3")
    if q["a"] not in (0, 1) or isinstance(q["a"], bool): err(f"{at}: a は 0／1")
    for k in ("s", "e", "m"):
        if not isinstance(q[k], str) or not q[k].strip(): err(f"{at}: {k} が空")
    if "y" in q and (not isinstance(q["y"], int) or isinstance(q["y"], bool)): err(f"{at}: y は整数（紀元前はマイナス）")
    if "g" in q and q["g"] not in GENRES.get(f"{q.get('f')}|{q.get('t')}", []): err(f"{at}: g「{q['g']}」は config の genres にない")
    if isinstance(q.get("e"), str) and not (60 <= len(q["e"]) <= 150): warn(f"{at}: 解説 e が {len(q['e'])}字（目安60〜150字）")
    if isinstance(q.get("m"), str) and not (10 <= len(q["m"]) <= 30): warn(f"{at}: 覚え方 m が {len(q['m'])}字（目安10〜30字）")
    if q.get("a") == 0 and isinstance(q.get("e"), str) and "正しくは" not in q["e"]: warn(f"{at}: ×の解説に「正しくは」がない")
    return True


def check_lesson(k, L, fname):
    at = f"{fname} {k}"
    if k not in ALL_TOPICS: err(f"{at}: キーが仕様の「分野|論点」にない"); return
    if not isinstance(L, dict): err(f"{at}: オブジェクトでない"); return
    for key in ("pts", "traps", "rel"):
        if not isinstance(L.get(key), list) or not all(isinstance(x, str) for x in L.get(key) or []):
            err(f"{at}: {key} は文字列の配列")
    if isinstance(L.get("pts"), list) and not (5 <= len(L["pts"]) <= 8): warn(f"{at}: 要点 pts が {len(L['pts'])}個（目安5〜8）")
    if isinstance(L.get("traps"), list) and not (3 <= len(L["traps"]) <= 6): warn(f"{at}: ひっかけ traps が {len(L['traps'])}個（目安3〜6）")
    if "bridge" in L and not isinstance(L["bridge"], str): err(f"{at}: bridge は文字列")
    S = L.get("sys")
    if not isinstance(S, dict): err(f"{at}: sys がない"); return
    if not isinstance(S.get("overview"), str): err(f"{at}: sys.overview は文字列")
    tree = S.get("tree")
    if not isinstance(tree, list) or not tree or not all(isinstance(b, dict) and isinstance(b.get("h"), str) and isinstance(b.get("items"), list) for b in tree):
        err(f"{at}: sys.tree は [{{h, items[]}}]（1つ以上）")
    fl = S.get("flow")
    if fl is not None and not (isinstance(fl, dict) and isinstance(fl.get("title"), str) and isinstance(fl.get("steps"), list)):
        err(f"{at}: sys.flow は {{title, steps[]}} か null")
    tables = S.get("tables")
    if not isinstance(tables, list): err(f"{at}: sys.tables は配列"); return
    for t in tables:
        if not (isinstance(t, dict) and isinstance(t.get("title"), str) and isinstance(t.get("head"), list) and isinstance(t.get("rows"), list)):
            err(f"{at}: 表は {{title, head[], rows[][]}}"); continue
        for r in t["rows"]:
            if not isinstance(r, list) or len(r) != len(t["head"]): err(f"{at}: 表「{t['title']}」の列数が head と違う")


def placeholder():
    return {"pts": ["（準備中）この論点の解説は作成中です。"], "traps": [], "rel": [], "bridge": "",
            "sys": {"overview": "（準備中）", "tree": [{"h": "準備中", "items": ["解説データの取り込み後に表示されます"]}], "flow": None, "tables": []}}


cur_items = json.loads(out_items.read_text(encoding="utf-8")) if out_items.exists() else []
cur_lessons = json.loads(out_lessons.read_text(encoding="utf-8")) if out_lessons.exists() else {}

items, lessons, done = [], {}, []
for f in FIELDS:
    ip, lp = src / f"{f}.items.json", src / f"{f}.lessons.json"
    if ip.exists():
        data = load(ip)
        if data is not None:
            if not isinstance(data, list): err(f"{ip.name}: 配列でない")
            else:
                for i, q in enumerate(data):
                    if check_item(q, ip.name, i):
                        if q["f"] != f: err(f"{ip.name} {q['ref']}: 分野 f が「{q['f']}」（ファイルは「{f}」）")
                        items.append({k: q[k] for k in ("f", "t", "ref", "lv", "s", "a", "e", "m", "y", "g", "w") if k in q})
                done.append(f)
    else:
        warn(f"{ip.name} がない → 「{f}」の問題は{'今のまま残す' if KEEP else '入れない'}")
        if KEEP: items += [q for q in cur_items if q.get("f") == f]
    if lp.exists():
        data = load(lp)
        if data is not None:
            if not isinstance(data, dict): err(f"{lp.name}: オブジェクト（{{\"分野|論点\": 解説}}）でない")
            else:
                for k, L in data.items():
                    check_lesson(k, L, lp.name)
                    if not k.startswith(f + "|"): err(f"{lp.name} {k}: 分野がファイル名「{f}」と違う")
                    lessons[k] = L
    else:
        warn(f"{lp.name} がない → 「{f}」の解説は{'今のまま残す' if KEEP else '仮の解説で埋める'}")
        if KEEP: lessons.update({k: v for k, v in cur_lessons.items() if k.startswith(f + "|")})

# 横断の検査：ref の重複・rel の参照先・論点ごとの×の割合
seen = {}
for q in items:
    if q["ref"] in seen: err(f"ref が重複 {q['ref']}（{seen[q['ref']]} と {q['t']}）")
    seen[q["ref"]] = q["t"]
for k, L in lessons.items():
    for r in L.get("rel") or []:
        if r not in ALL_TOPICS: err(f"{k}: rel「{r}」が仕様の論点にない")
        elif r == k: err(f"{k}: rel に自分自身")
for k in ALL_TOPICS:
    qs = [q for q in items if f"{q['f']}|{q['t']}" == k]
    if qs:
        x = sum(1 for q in qs if q["a"] == 0) / len(qs)
        if not (0.4 <= x <= 0.6): warn(f"{k}: ×の割合 {round(x * 100)}%（目安40〜60%）")
        lv = [sum(1 for q in qs if q["lv"] == l) for l in (1, 2, 3)]
        if 0 in lv: warn(f"{k}: 水準がそろっていない lv1:lv2:lv3={lv[0]}:{lv[1]}:{lv[2]}（目安4:4:3）")
    if k not in lessons:
        if qs or k.split("|")[0] in done: warn(f"{k}: 解説がない → 仮の解説で埋める")
for f in FIELDS:
    n = sum(1 for q in items if q["f"] == f)
    need = max(m.get(f, 0) for m in cfg["rounds"])
    if n < need * 2: warn(f"「{f}」の問題が {n}問（1回に最大{need}問出すため、少なくとも{need * 2}問ほしい）")

for w in warns: print("警告:", w)
if errors:
    for e in errors: print("誤り:", e)
    print(f"誤り {len(errors)}件のため書き出しませんでした")
    sys.exit(1)

order = {f: i for i, f in enumerate(FIELDS)}
items.sort(key=lambda q: (order[q["f"]], q["ref"]))
out_l = {k: lessons.get(k) or placeholder() for k in ALL_TOPICS}

if DRY:
    print(f"検査のみ（--dry-run）：問題 {len(items)}問・解説 {sum(1 for k in ALL_TOPICS if k in lessons)}/{len(ALL_TOPICS)}論点")
    sys.exit(0)
out_items.write_text("[\n" + ",\n".join(json.dumps(q, ensure_ascii=False, separators=(",", ":")) for q in items) + "\n]\n", encoding="utf-8")
out_lessons.write_text(json.dumps(out_l, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"wrote {out_items.relative_to(root)}（{len(items)}問）・{out_lessons.relative_to(root)}（解説 {sum(1 for k in ALL_TOPICS if k in lessons)}/{len(ALL_TOPICS)}論点、残りは仮）")
print("続けて npm test・python3 web/nihonshi/build.py を実行してください")
