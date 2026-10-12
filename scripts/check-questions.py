#!/usr/bin/env python3
"""テスト集の問題データ検査: python3 check.py <file.json> [最低問題数] [history|lang]
立教と同じ形式（id,k,ref,f,t,y,q,c,e,m, 任意 a,last,p）を検査する。
lang（英語・国語）は y を付けない・本文 p を使える。"""
import json, sys, collections

path = sys.argv[1]
need = int(sys.argv[2]) if len(sys.argv) > 2 else 0
mode = sys.argv[3] if len(sys.argv) > 3 else "history"
assert mode in ("history", "lang")
qs = json.load(open(path, encoding="utf-8"))
errs = []
ids = set()
REQ = ("id", "k", "ref", "f", "t", "y", "q", "c", "e", "m") if mode == "history" else ("id", "k", "ref", "f", "t", "q", "c", "e", "m")
ALL_WORDS = ("すべて", "あてはまるものがない", "該当なし")
for i, q in enumerate(qs):
    at = f"[{i}] id={q.get('id')}"
    for k in REQ:
        if k not in q or q[k] in ("", None, []):
            errs.append(f"{at}: {k} がない")
    extra = set(q) - set(REQ) - {"a", "last", "fix"} - ({"p"} if mode == "lang" else set())
    if extra:
        errs.append(f"{at}: 余計なキー {sorted(extra)}")
    if q.get("id") in ids:
        errs.append(f"{at}: id 重複")
    ids.add(q.get("id"))
    if q.get("id") != i + 1:
        errs.append(f"{at}: id は 1 からの連番にする（期待 {i+1}）")
    if q.get("k") not in ("past", "plan"):
        errs.append(f"{at}: k は past か plan")
    if q.get("k") == "plan" and q.get("ref") != "想定問題":
        errs.append(f"{at}: plan の ref は「想定問題」")
    if q.get("k") == "past" and not str(q.get("ref", "")).startswith("20"):
        errs.append(f"{at}: past の ref は「2026年度 経済学部 Ⅰ 問3」の形")
    c = q.get("c", [])
    if not (4 <= len(c) <= 5):
        errs.append(f"{at}: 選択肢 {len(c)} 個")
    if len(set(c)) != len(c):
        errs.append(f"{at}: 同じ選択肢がある")
    a = q.get("a", 0)
    if not (isinstance(a, int) and 0 <= a < len(c)):
        errs.append(f"{at}: a={a} が範囲外")
    if q.get("fix") not in (None, True):
        errs.append(f"{at}: fix は true のときだけ書く")
    if a != 0 and not q.get("last") and not q.get("fix"):
        errs.append(f"{at}: a≠0 は last=true（末尾固定肢が正解）か fix=true（原文の順で出す）のときだけ")
    if q.get("last") and not any(w in c[-1] for w in ALL_WORDS):
        errs.append(f"{at}: last=true なのに最後の選択肢が「すべて…／あてはまるものがない」でない")
    if not q.get("last") and not q.get("fix") and any(w in x for x in c for w in ALL_WORDS if x.startswith(w)):
        errs.append(f"{at}: 「すべて…」の選択肢があるなら last=true")
    if mode == "history" and not isinstance(q.get("y"), int):
        errs.append(f"{at}: y は整数")
    if mode == "lang" and "y" in q:
        errs.append(f"{at}: 英語・国語に y は付けない")
    if len(q.get("q", "")) > (260 if mode == "history" else 320):
        errs.append(f"{at}: 問題文が長すぎる（{len(q['q'])}字）")
    if "p" in q and not (60 <= len(q["p"]) <= 1800):
        errs.append(f"{at}: 本文 p は60〜1800字（{len(q['p'])}字）")
    if not (80 <= len(q.get("e", "")) <= 420):
        errs.append(f"{at}: 解説は80〜420字（{len(q.get('e',''))}字）")
    if len(q.get("m", "")) > 60:
        errs.append(f"{at}: 覚え方は60字以内")
if need and len(qs) < need:
    errs.append(f"問題数 {len(qs)} < {need}")
fc = collections.Counter(q.get("f") for q in qs)
kc = collections.Counter(q.get("k") for q in qs)
tc = collections.Counter(q.get("t") for q in qs)
dup_t = [t for t, n in tc.items() if n > (2 if mode == "history" else 6)]
if dup_t:
    errs.append(f"同じ論点名が3問以上: {dup_t[:5]}")
print(f"{path}: {len(qs)}問  区分 {dict(kc)}  分野 {dict(fc)}")
if errs:
    print("\n".join(errs[:80]))
    print(f"NG: {len(errs)} 件")
    sys.exit(1)
print("OK")
