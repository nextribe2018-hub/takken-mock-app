#!/usr/bin/env python3
"""立教 世界史・日本史のWeb版（Claudeアーティファクト）を組み立てる: python3 web/rikkyo/build.py
src/data/rikkyo-<科目>.json の問題を検査してから web/rikkyo/<科目>.template.html の __DATA__ に埋め込み、
web/rikkyo/rikkyo-<科目>.html を出力する。"""
import json, pathlib, sys

here = pathlib.Path(__file__).resolve().parent
root = here.parent.parent
SUBJECTS = {
    "sekaishi": {"title": "立教世界史 10問テスト", "kinds": None},
    "nihonshi": {"title": "立教日本史 10問テスト", "kinds": {"past", "plan"}},
}
REQUIRED = ("id", "ref", "f", "t", "y", "q", "c", "e", "m")


def check(name, qs, kinds):
    """問題データの形を確かめる。おかしな所があればまとめて返す。"""
    errs, seen = [], set()
    for i, q in enumerate(qs):
        at = f"{name}[{i}] id={q.get('id')}"
        for k in REQUIRED:
            if k not in q or q[k] in ("", None):
                errs.append(f"{at}: {k} がない")
        if q.get("id") in seen:
            errs.append(f"{at}: id が重複")
        seen.add(q.get("id"))
        c = q.get("c", [])
        if not (4 <= len(c) <= 5):
            errs.append(f"{at}: 選択肢が {len(c)} 個（4〜5個のはず）")
        if len(set(c)) != len(c):
            errs.append(f"{at}: 同じ選択肢がある")
        a = q.get("a", 0)
        if not (isinstance(a, int) and 0 <= a < len(c)):
            errs.append(f"{at}: 正解番号 a={a} が範囲外")
        if not isinstance(q.get("y"), int):
            errs.append(f"{at}: 年 y が整数でない")
        if kinds is not None and q.get("k") not in kinds:
            errs.append(f"{at}: 種別 k={q.get('k')} が不正")
    return errs


def dump(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def main():
    only = sys.argv[1:] or list(SUBJECTS)
    errs = []
    for name in only:
        qs = json.loads((root / f"src/data/rikkyo-{name}.json").read_text(encoding="utf-8"))
        errs += check(name, qs, SUBJECTS[name]["kinds"])
        if errs:
            continue
        tpl = (here / f"{name}.template.html").read_text(encoding="utf-8")
        assert tpl.count("__DATA__") == 1, f"{name}: テンプレートの __DATA__ が1か所ではない"
        out = tpl.replace("__DATA__", dump(qs), 1)
        dst = here / f"rikkyo-{name}.html"
        dst.write_text(out, encoding="utf-8")
        print(f"wrote {dst.relative_to(root)}  {len(qs)}問  {len(out.encode())} bytes")
    if errs:
        print("\n".join(errs), file=sys.stderr)
        sys.exit(f"データに {len(errs)} 件の問題があるため出力しませんでした")


if __name__ == "__main__":
    main()
