#!/usr/bin/env python3
"""慶應 経済学部・商学部の世界史・日本史のWeb版（Claudeアーティファクト）を組み立てる: python3 web/keio/build.py
src/data/keio-<学部>-<科目>.json の問題を検査してから web/exam-template.html（共通テンプレート）に埋め込み、
web/keio/keio-<学部>-<科目>.html を出力する。分野の並びは各分野の平均年代の古い順。"""
import json, pathlib, sys

here = pathlib.Path(__file__).resolve().parent
root = here.parent.parent
sys.path.insert(0, str(here.parent / "rikkyo"))
from build import check, dump  # 立教と同じデータ検査を使う

FAC = {"econ": "経済学部", "comm": "商学部"}
SUB = {"sekaishi": ("世界史", "世界史探究", "wh"), "nihonshi": ("日本史", "日本史探究", "jh")}
TLNOTE = {
    "econ": "慶應の経済学部は、出来事の時期や順序、因果関係を問う設問が多く出ます。",
    "comm": "慶應の商学部は、出来事の時期や順序を手がかりに考える設問がよく出ます。",
}


def fields_of(qs):
    by = {}
    for q in qs:
        by.setdefault(q["f"], []).append(q["y"])
    return sorted(by, key=lambda f: sum(by[f]) / len(by[f]))


def build(fac, sub):
    name = f"{fac}-{sub}"
    qs = json.loads((root / f"src/data/keio-{name}.json").read_text(encoding="utf-8"))
    errs = check(f"keio-{name}", qs, {"past", "plan"})
    if errs:
        return errs
    f, s = FAC[fac], SUB[sub]
    title = f"慶應{f[:2]} {s[0]} 10問テスト"
    years = sorted({q["ref"][:4] for q in qs if q["k"] == "past"})
    foot = (
        f"このページは慶應義塾大学の公式教材ではありません。「過去問ベース」は、慶應義塾大学が公開している"
        f"{'・'.join(years)}年度一般選抜（{f}）の{s[0]}の試験問題と出題意図・解答例をもとに、問われた知識を選択式に作り直した問題です。"
        "設問文と選択肢は独自に作成したもので、実際の試験の文面とは異なります。地図・図版・統計を使う設問は入っていません。"
        "「想定問題」は、大学が公表している出題意図と出題形式に合わせて独自に作成した問題で、実際に出題されたものではありません。"
        "解説と覚え方も独自に作成したものです。"
    )
    rep = {
        "__TITLE__": title,
        "__EYEBROW__": f"歴史総合，{s[1]}｜慶應義塾大学 {f} 一般選抜の過去問ベースと想定問題",
        "__FOOT__": foot,
        "__FIELDS__": dump(fields_of(qs)),
        "__LS__": f"keio-{fac}-{s[2]}-v1",
        "__SCHOOL__": f"慶應義塾大学 {f}",
        "__TLNOTE__": TLNOTE[fac],
        "__LINK__": "https://www.keio.ac.jp/ja/admissions/faculty/examinations/general-admissions/",
        "__LINKTEXT__": "慶應義塾大学 一般選抜（試験問題・出題意図・解答例の公開ページ・公式）",
        "__UNIV__": "慶應義塾大学",
        "__DATA__": dump(qs),
    }
    out = (here.parent / "exam-template.html").read_text(encoding="utf-8")
    for k, v in rep.items():
        assert k in out, k
        out = out.replace(k, v)
    assert "__" not in out.replace("__proto__", ""), "置換漏れ"
    dst = here / f"keio-{name}.html"
    dst.write_text(out, encoding="utf-8")
    print(f"wrote {dst.relative_to(root)}  {len(qs)}問  {len(out.encode())} bytes")
    return []


def main():
    errs = []
    for fac in FAC:
        for sub in SUB:
            if (root / f"src/data/keio-{fac}-{sub}.json").exists():
                errs += build(fac, sub)
    if errs:
        print("\n".join(errs), file=sys.stderr)
        sys.exit(f"データに {len(errs)} 件の問題があるため一部を出力しませんでした")


if __name__ == "__main__":
    main()
