#!/usr/bin/env python3
"""日本史○×の追加問題を取り込む: python3 scripts/nihonshi-add.py [--dry-run]

content-work/nihonshi/add/<分野>__<論点>.txt（1行1問 `lv|a|s|e|m|y|g|w`、校閲済み）と
content-work/nihonshi/add/tags/<分野>__<論点>.txt（既存問題のジャンル `ref|g|w`）を読み、
content-work/nihonshi/<分野>.items.json に追記する（ref は分野ごとの続き番号。既存の ref は変えない）。
そのあと python3 scripts/nihonshi-merge.py で src/data へ反映する。

- 形式の誤り・ジャンル名の誤り・完全一致の重複はエラー（何も書かない）
- よく似た問題（2文字組の重なり 0.75 以上）は警告として一覧を出す
"""
import json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
cfg = json.loads((root / "src/data/nihonshi-config.json").read_text(encoding="utf-8"))
base = root / "content-work/nihonshi"
add = base / "add"
DRY = "--dry-run" in sys.argv
GEN = cfg["genres"]
errs, warns = [], []


def bigrams(x):
    s = re.sub(r"[\s、。・：（）()「」，,．.0-9０-９]", "", x)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def sim(a, b):
    return len(a & b) / max(1, min(len(a), len(b)))


out = {}
added = 0
for F in cfg["fields"]:
    f, pre = F["f"], F["ref"]
    path = base / f"{f}.items.json"
    items = json.loads(path.read_text(encoding="utf-8"))
    n = max(int(q["ref"].split("-")[1]) for q in items)
    for t in F["topics"]:
        key = f"{f}|{t}"
        tag = add / "tags" / f"{f}__{t}.txt"
        if tag.exists():
            m = {}
            for l in tag.read_text(encoding="utf-8").split("\n"):
                if not l.strip(): continue
                c = [x.strip() for x in l.split("|")]
                if len(c) != 3 or not c[2]: errs.append(f"{tag.name}: 「{l[:30]}」は ref|g|w の3列でない"); continue
                m[c[0]] = c[1:]
            for q in items:
                if q["t"] == t and q["ref"] in m:
                    g, w = m[q["ref"]]
                    if g not in GEN[key]: errs.append(f"{tag.name}: {q['ref']} のジャンル「{g}」が一覧にない")
                    q["g"], q["w"] = g, w
        src = add / f"{f}__{t}.txt"
        if not src.exists():
            warns.append(f"{src.name} がない"); continue
        seen = [(q["s"], bigrams(q["s"])) for q in items if q["t"] == t]
        for no, l in enumerate(src.read_text(encoding="utf-8").split("\n"), 1):
            if not l.strip(): continue
            at = f"{src.name}:{no}"
            p = l.split("|")
            if len(p) != 8: errs.append(f"{at}: 列が{len(p)}個（8個のはず）"); continue
            lv, a, s, e, mm, y, g, w = (x.strip() for x in p)
            if not w: errs.append(f"{at}: キーワードが空")
            if lv not in ("1", "2", "3") or a not in ("0", "1"): errs.append(f"{at}: lv/a の値"); continue
            if g not in GEN[key]: errs.append(f"{at}: ジャンル「{g}」が一覧にない")
            if a == "0" and not e.startswith("誤り"): errs.append(f"{at}: ×なのに解説が「誤り」で始まらない")
            if a == "1" and e.startswith("誤り"): errs.append(f"{at}: ○なのに解説が「誤り」で始まる")
            if not 50 <= len(e) <= 170: warns.append(f"{at}: 解説{len(e)}字")
            if not 8 <= len(mm) <= 34: warns.append(f"{at}: 覚え方{len(mm)}字")
            if y and not re.fullmatch(r"-?\d+", y): errs.append(f"{at}: y が整数でない"); y = ""
            b = bigrams(s)
            for s2, b2 in seen:
                if s == s2: errs.append(f"{at}: 完全に同じ問題がある"); break
                if sim(b, b2) >= 0.75: warns.append(f"{at}: 似た問題「{s2[:30]}…」"); break
            seen.append((s, b))
            n += 1
            q = {"f": f, "t": t, "ref": f"{pre}-{n:04d}", "lv": int(lv), "s": s, "a": int(a), "e": e, "m": mm}
            if y: q["y"] = int(y)
            q["g"], q["w"] = g, w
            items.append(q); added += 1
    out[path] = items

for w in warns[:80]: print("警告:", w)
if len(warns) > 80: print(f"警告: ほか{len(warns) - 80}件")
for e in errs[:80]: print("エラー:", e)
if errs:
    print(f"エラー{len(errs)}件のため書き出しません"); sys.exit(1)
total = sum(len(v) for v in out.values())
untag = sum(1 for v in out.values() for q in v if "g" not in q or "w" not in q)
print(f"追加 {added}問 → 合計 {total}問（ジャンル・キーワード未設定 {untag}問）")
if not DRY:
    for path, items in out.items():
        path.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("書き出しました。続けて python3 scripts/nihonshi-merge.py を実行")
