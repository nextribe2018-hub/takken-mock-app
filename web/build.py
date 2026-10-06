#!/usr/bin/env python3
"""Web版（Claudeアーティファクト）を組み立てる: python3 web/build.py
template.html の __DATA__ / __LESSON__ に src/data の問題・解説を埋め込み、web/takken-mock.html を出力する。"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root / "web/template.html").read_text(encoding="utf-8")
bank = json.loads((root / "src/data/bank.json").read_text(encoding="utf-8"))
lesson = json.loads((root / "src/data/lessons.json").read_text(encoding="utf-8"))
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
out = tpl.replace("__DATA__", dump(bank), 1).replace("__LESSON__", dump(lesson), 1)
assert "__DATA__" not in out and "__LESSON__" not in out
(root / "web/takken-mock.html").write_text(out, encoding="utf-8")
print("wrote web/takken-mock.html", len(out), "bytes")
