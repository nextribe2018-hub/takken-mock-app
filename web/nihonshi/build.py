#!/usr/bin/env python3
"""日本史○×10分模試のWeb版（Claudeアーティファクト）を検査＋組み立てる: python3 web/nihonshi/build.py
web/nihonshi/template.html の __DATA__ / __LESSON__ / __CONFIG__ に
src/data/nihonshi-ox.json・nihonshi-lessons.json・nihonshi-config.json を埋め込み、web/nihonshi/nihonshi-ox.html を出力する。
学習記録はブラウザ（nox-*）とアーティファクトDBの data/users/<uid>/nihonshi-ox に保存（宅建Web版とは別）。"""
import json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent.parent
here = root / "web/nihonshi"
tpl = (here / "template.html").read_text(encoding="utf-8")
items = json.loads((root / "src/data/nihonshi-ox.json").read_text(encoding="utf-8"))
lessons = json.loads((root / "src/data/nihonshi-lessons.json").read_text(encoding="utf-8"))
cfg = json.loads((root / "src/data/nihonshi-config.json").read_text(encoding="utf-8"))

# 検査（詳しい検査は scripts/nihonshi-merge.py と npm test）
prefix = {F["f"]: F["ref"] for F in cfg["fields"]}
topics = {f"{F['f']}|{t}" for F in cfg["fields"] for t in F["topics"]}
errs, refs = [], set()
for q in items:
    k = f"{q.get('f')}|{q.get('t')}"
    if k not in topics: errs.append(f"{q.get('ref')}: 論点が仕様にない {k}")
    if not re.fullmatch(rf"{prefix.get(q.get('f'), '??')}-\d{{4}}", str(q.get("ref"))): errs.append(f"{q.get('ref')}: ref の形式")
    if q.get("ref") in refs: errs.append(f"{q.get('ref')}: ref が重複")
    refs.add(q.get("ref"))
    if q.get("lv") not in (1, 2, 3): errs.append(f"{q.get('ref')}: lv")
    if q.get("a") not in (0, 1): errs.append(f"{q.get('ref')}: a")
missing = sorted(topics - lessons.keys())
if missing: errs.append(f"解説がない論点 {missing}")
for k, L in lessons.items():
    for r in L.get("rel", []):
        if r not in lessons: errs.append(f"{k}: rel {r} がない")
if errs:
    print("\n".join("誤り: " + e for e in errs)); sys.exit(1)

dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
out = tpl.replace("__DATA__", dump(items), 1).replace("__LESSON__", dump(lessons), 1).replace("__CONFIG__", dump(cfg), 1)
assert "__DATA__" not in out and "__LESSON__" not in out and "__CONFIG__" not in out
(here / "nihonshi-ox.html").write_text(out, encoding="utf-8")
print(f"wrote web/nihonshi/nihonshi-ox.html {len(out)} bytes（{len(items)}問・{len(lessons)}論点）")
