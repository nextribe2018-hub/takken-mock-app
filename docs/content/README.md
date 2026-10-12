# 問題集の作り方（セッションを分けて作るときの手順）

大学入試・税理士の問題集（2026-10-11）と同じ品質で作るための手順。各セッションはこの手順に従う。

## 道具
| ファイル | 役割 |
|---|---|
| `docs/content/guide-common.md` | 全科目共通の作成ルール（データ形式・著作権・正確さ） |
| `docs/content/guide-subjects.md` | 科目・試験の種類ごとの作り方 |
| `docs/content/guide-check.md` | 校閲（事実確認）の手順 |
| `scripts/check-questions.py` | データ検査：`python3 scripts/check-questions.py <file> <問題数> <history\|lang>` |
| `web/univ/units/<単位>.json` | Web版の試験の設定（形式は `web/univ/units/README.md`） |
| `web/univ/build.py` | Web版の組み立て（データ検査つき）：`python3 web/univ/build.py` |

## 1セットの流れ
1. **素材集め**：実施団体・大学などの公式サイトだけから、過去問・解答・出題範囲・利用条件を集める。保存先はセッションの作業フォルダ（scratchpad）の `src/<単位>/`、記録は同じ場所の `index.md`（保存ファイルの表・公開されていないもの・利用条件の原文・試験形式）。予備校・赤本など第三者の資料は使わない。ボット対策で取れない資料は、回避せずユーザーに相談する。
2. **作成**：1セット1担当（サブエージェント）。guide-common.md と guide-subjects.md に厳密に従う。出力は作業フォルダの `out/<単位>-<科目>.json`。
3. **校閲**：作成とは別の担当が guide-check.md の手順で全問を点検し、直接直す。計算は独立に Python で検算。古文・漢文・史料は原典と照合。過去問の数値・文面の写しを言い換える。
4. **取り込み**：`scripts/check-questions.py` が OK のものだけ `src/data/<単位>-<科目>.json` に置く。`web/univ/units/<単位>.json` を書き、`python3 web/univ/build.py` で `web/univ/<単位>-<科目>.html` を作る。
5. **公開**：Artifact ツールで `web/univ/<id>.html` を publish（capabilities は `{"db": {}, "user": {}}`、icon は exam）。URL を `docs/WEB_PAGES.md` に追記する。

## ぶつからないための決まり
- 各セッションが触るのは、自分の単位の `src/data/<単位>-*.json`、`web/univ/units/<単位>.json`、`web/univ/<単位>-*.html`、`docs/WEB_PAGES.md` への追記だけ。
- **`src/exams.ts`・`App.tsx`・`variants.json` には触らない。** アプリへの登録（`src/exams.ts` の EXAMS への追記と `npm run variants`）は、全セッションが終わったあとに1か所でまとめて行う（App Store準備セッションの決まり：試験を足したら `npm run variants`、問題データは末尾に足す）。
- 単位名・ファイル名は英小文字とハイフン。既存の単位（kindai, nichidai, meiji, waseda, todai, zeirishi, keio, rikkyo, takken）と重ねない。
- 各セッションは自分の git ブランチ（worktree）で作業し、終わったらプルリクエストにする。main へのマージはユーザーの指示があってから。

## 権利（必ず記録する）
- 公式サイトにある二次利用の条件（報告義務・出典表示・営利利用の可否）を原文で記録し、Web版のフッター（units の `extra`）で必要な表示をする。
- 公開・販売の前に専門家の確認が必要な点は、プルリクエストの説明に書く。
