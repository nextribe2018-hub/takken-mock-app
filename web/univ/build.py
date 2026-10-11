#!/usr/bin/env python3
"""早稲田・明治・日大・近大・東大・税理士などのWeb版（Claudeアーティファクト）を組み立てる: python3 web/univ/build.py
src/data/<id>.json の問題を検査してから web/exam-template.html（共通テンプレート）に埋め込み、
web/univ/<id>.html を出力する。データがまだない試験は飛ばす。"""
import json, pathlib, sys

here = pathlib.Path(__file__).resolve().parent
root = here.parent.parent
sys.path.insert(0, str(here.parent / "rikkyo"))
from build import check, dump  # 立教と同じデータ検査を使う

# 科目：表示名、eyebrow の範囲、年の並び（年表）を使うか
SUB = {
    "nihonshi": ("日本史", "歴史総合，日本史探究"),
    "sekaishi": ("世界史", "歴史総合，世界史探究"),
    "chiri": ("地理", "地理総合，地理探究"),
    "eigo": ("英語", "英語"),
    "kokugo": ("国語", "国語"),
    "sugaku-bun": ("数学（文科）", "数学"),
    "sugaku-ri": ("数学（理科）", "数学"),
    "butsuri": ("物理", "物理"),
    "kagaku": ("化学", "化学"),
    "seibutsu": ("生物", "生物"),
    "boki": ("簿記論", "会計科目"),
    "zaihyo": ("財務諸表論", "会計科目"),
    "houjin": ("法人税法", "税法科目"),
    "shotoku": ("所得税法", "税法科目"),
    "shouhi": ("消費税法", "税法科目"),
    "souzoku": ("相続税法", "税法科目"),
}

# 試験の単位：id の頭 → (短い名前, 正式名, 試験の説明, 公式ページ, リンク文字)
UNITS = {
    "kindai": ("近大", "近畿大学", "一般入試前期A日程（医学部以外の全学部共通問題）",
               "https://kindai.jp/exam/past/", "近畿大学 過去の入試問題（公式）"),
    "nichidai": ("日大", "日本大学", "一般選抜N方式第1期・経済学部A個別方式",
                 "https://www.nihon-u.ac.jp/admission_info/application/date/past_test/", "日本大学 過去の入試問題（公式）"),
    "meiji": ("明治", "明治大学", "一般選抜（全学部統一入試・学部別入試）",
              "https://www.meiji.ac.jp/exam/information/guidelines/index.html", "明治大学 一般選抜 入試要項（公式）"),
    "waseda": ("早稲田", "早稲田大学", "一般選抜（商・社会科学・教育・文学部）",
               "https://www.waseda.jp/inst/admission/", "早稲田大学 入学センター（公式）"),
    "todai": ("東大", "東京大学", "前期日程 第2次学力試験",
              "https://www.u-tokyo.ac.jp/ja/admissions/undergraduate/e02_07_25.html", "東京大学 過去の入試問題（公式）"),
    "zeirishi": ("税理士", "税理士試験", "国税審議会",
                 "https://www.nta.go.jp/taxes/zeirishi/zeirishishiken/zeirishi.htm", "国税庁 税理士試験（公式）"),
}

# 想定問題だけのときの理由
PLAN_ONLY = {
    "meiji": "明治大学の一般選抜の問題は公式サイトで公開されていないため、すべて独自に作成した想定問題です。",
    "waseda": "早稲田大学の過去問題は今回参照していないため、すべて独自に作成した想定問題です。",
    "todai": "東京大学の英語の問題冊子は著作権の都合で公開されていないため、すべて独自に作成した想定問題です。",
}
# 出典・利用条件として必ず添える文
EXTRA = {
    "todai": "東京大学の入試問題を改変して利用しています。解答・解説は東京大学が公表したものではありません。",
    "zeirishi": ("出典：国税庁ホームページ（https://www.nta.go.jp/taxes/zeirishi/zeirishishiken/zeirishi.htm）の税理士試験の試験問題を加工して作成。"
                 "法令等は令和8年4月3日現在施行のもの（所得税法の計算は令和7年分）に基づきます。税務の個別の助言ではありません。"),
}


def fields_of(qs):
    if all("y" not in q for q in qs):  # 英語・国語などは出てきた順
        return list(dict.fromkeys(q["f"] for q in qs))
    by = {}
    for q in qs:
        by.setdefault(q["f"], []).append(q.get("y", 0))
    return sorted(by, key=lambda f: sum(by[f]) / len(by[f]))


def build(unit, sub):
    xid = f"{unit}-{sub}"
    qs = json.loads((root / f"src/data/{xid}.json").read_text(encoding="utf-8"))
    errs = check(xid, qs, {"past", "plan"})
    if errs:
        return errs
    short, univ, exam, link, linktext = UNITS[unit]
    sname, scope = SUB[sub]
    past = [q for q in qs if q["k"] == "past"]
    years = sorted({q["ref"][:4] for q in past})
    if past:
        what = "試験問題（解答は非公表）と出題のポイント" if unit == "zeirishi" else "入試問題・解答・出題意図"
        who = "国税庁" if unit == "zeirishi" else univ
        src = (f"「過去問ベース」は、{who}が公式に公開している{'・'.join(years)}年度の{what}をもとに、"
               "問われた知識を選択式に作り直した問題です。設問文・選択肢・本文は独自に作成したもので、実際の試験の文面とは異なります。")
    else:
        src = PLAN_ONLY[unit]
    foot = (
        f"このページは{'国税庁・国税審議会' if unit == 'zeirishi' else univ}の公式教材ではありません。{src}"
        "「想定問題」は、公表されている出題範囲・出題形式に合わせて独自に作成した問題で、実際に出題されたものではありません。"
        + ("英語・現代文の本文は独自に作成した文章です。古文・漢文は著作権の切れた古典の原文を使っています。" if sub in ("eigo", "kokugo") else "")
        + "解説と覚え方も独自に作成したものです。" + EXTRA.get(unit, "")
    )
    rep = {
        "__TITLE__": f"{short} {sname} 10問テスト",
        "__EYEBROW__": f"{scope}｜{univ} {exam}" if unit != "zeirishi" else f"税理士試験（{exam}）｜{scope}・令和8年4月3日現在の法令",
        "__FOOT__": foot,
        "__FIELDS__": dump(fields_of(qs)),
        "__LS__": f"{xid}-v1",
        "__SCHOOL__": univ,
        "__TLNOTE__": "出来事の時期と順序をあわせて確かめましょう。",
        "__LINK__": link,
        "__LINKTEXT__": linktext,
        "__UNIV__": univ,
        "__DATA__": dump(qs),
    }
    out = (here.parent / "exam-template.html").read_text(encoding="utf-8")
    for k, v in rep.items():
        assert k in out, k
        out = out.replace(k, v)
    assert "__" not in out.replace("__proto__", ""), "置換漏れ"
    dst = here / f"{xid}.html"
    dst.write_text(out, encoding="utf-8")
    print(f"wrote {dst.relative_to(root)}  {len(qs)}問  {len(out.encode())} bytes")
    return []


def main():
    errs = []
    for unit in UNITS:
        for sub in SUB:
            if (root / f"src/data/{unit}-{sub}.json").exists():
                errs += build(unit, sub)
    if errs:
        print("\n".join(errs), file=sys.stderr)
        sys.exit(f"データに {len(errs)} 件の問題があるため一部を出力しませんでした")


if __name__ == "__main__":
    main()
