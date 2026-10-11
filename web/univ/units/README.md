# 試験の単位の設定（web/univ/units/<単位>.json）

ここに1ファイル置くと `python3 web/univ/build.py` がその試験のWeb版を組み立てる。データは `src/data/<単位>-<科目>.json`。

```json
{
  "unit": "itpass",
  "short": "ITパス",
  "name": "ITパスポート試験",
  "exam": "（情報処理推進機構）",
  "link": "https://www3.jitec.ipa.go.jp/JitesCbt/",
  "linktext": "ITパスポート試験（公式）",
  "owner": "情報処理推進機構（IPA）",
  "who": "情報処理推進機構（IPA）",
  "what": "公開問題と解答",
  "plan_only": "（past が1問もないときに使う説明）",
  "extra": "（出典表示など、利用条件で必要な文）",
  "eyebrow": "{name}｜{scope}・2026年4月1日現在",
  "subjects": { "all": ["ITパスポート", "ストラテジ・マネジメント・テクノロジ"] }
}
```

- 必須：unit, short, name, exam, link, linktext, subjects（科目キー → [表示名, 範囲]）
- 任意：owner（「〇〇の公式教材ではありません」の〇〇）、who／what（過去問ベースの出典説明）、plan_only、extra、eyebrow（{name} {scope} {exam} が使える）
- 任意：past_src（過去問の文面をそのまま使う試験の出典説明。{years} が使える。ないときは「独自に作り直した」という既定の文）
- 単位名は既存（kindai, nichidai, meiji, waseda, todai, zeirishi）と重ねない
