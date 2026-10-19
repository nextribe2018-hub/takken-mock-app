#!/usr/bin/env python3
"""英単語 30語1分 のWeb版（Claudeアーティファクト）を組み立てる: python3 web/vocab/build.py
src/data/vocab.json を検査して web/vocab/template.html の __DATA__ に埋め込み、web/vocab/vocab.html を出力する。"""
import json, pathlib, sys

here = pathlib.Path(__file__).resolve().parent
root = here.parent.parent
levels = json.loads((root / "src/data/vocab.json").read_text(encoding="utf-8"))

errs = []
for L in levels:
    ws = L["words"]
    if len(ws) != 300 or len(ws) % 30:
        errs.append(f"{L['id']}: {len(ws)}語（300語・30の倍数であること）")
    if not L.get("ref") or not str(L["id"]).startswith("toeic"):
        errs.append(f"{L['id']}: id は toeic500〜900、ref（参考レベル）が必要")
    if len({w["w"] for w in ws}) != len(ws):
        errs.append(f"{L['id']}: 語が重複")
    for w in ws:
        if not (w.get("w") and w.get("m") and w.get("p")):
            errs.append(f"{L['id']}: {w} の語・意味・品詞が空")
if errs:
    sys.exit("\n".join(errs))

data = json.dumps(levels, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
html = (here / "template.html").read_text(encoding="utf-8").replace("__DATA__", data)
(here / "vocab.html").write_text(html, encoding="utf-8")
print(f"web/vocab/vocab.html: {len(levels)}レベル・{sum(len(L['words']) for L in levels)}語・{len(html)//1024}KB")
