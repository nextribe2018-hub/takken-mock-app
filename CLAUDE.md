# CLAUDE.md

10分模試の総合アプリ（宅建・立教 世界史・日本史…を入口で選ぶ）。Expo（SDK 57）＋ React Native ＋ TypeScript。
App Store で「無料＋試験ごとの買い切り解除」で公開するのが目標。

**作業を始める前に `docs/HANDOFF.md` を読むこと。** 現状・決定事項・未決事項・データ仕様・TODO がまとまっている。

## 応答のルール
- 日本語で回答する。提案は表か箇条書きで
- 結論の理由を示す。分からないことは分からないと言う
- 変更したら `npm test` と `npm run typecheck` を通してから報告する
- 仕様（出題比率・判定基準・復習の流れ）を変えるときは先に確認する
- 問題の安定キー（宅建は `分野|論点|出典`、立教・慶應は `id`）は変えない。学習記録が壊れる

## コマンド
```bash
npm install
npx expo start
npm test
npm run typecheck
python3 web/build.py          # 宅建Web版（Claudeアーティファクト用HTML）を再生成
python3 web/rikkyo/build.py   # 立教 世界史・日本史のWeb版を検査＋再生成
python3 web/keio/build.py     # 慶應 経済・商の世界史・日本史のWeb版を検査＋再生成
python3 web/univ/build.py     # 近大・日大・明治・早稲田・東大・税理士のWeb版を検査＋再生成（一覧は docs/WEB_PAGES.md）
```

## 構成
- `App.tsx` 画面 ／ `src/exams.ts` 試験パック ／ `src/logic.ts` ロジック ／ `src/storage.ts` 保存 ／ `src/theme.ts` 色
- `src/data/bank.json` 宅建532問 ／ `src/data/lessons.json` 解説46論点 ／ `src/data/rikkyo-*.json` 立教 世界史105問・日本史215問 ／ `src/data/keio-*.json` 慶應 経済・商の世界史・日本史 各100問
- 試験を増やすときは `src/exams.ts` の `EXAMS` に1件足す（`npm test` が全試験のデータ形式と出題を検査する）
- `web/` 宅建Web版、`web/rikkyo/` 立教Web版、`web/keio/` 慶應Web版のテンプレートとビルド

## 注意
- `npx expo install` が失敗する環境では `expo/bundledNativeModules.json` の版を `npm install` で指定する
- 宣伝文・説明文で「合格保証」等の表現は使わない
- `AGENTS.md` は create-expo-app の既定ファイル（Expo Router 推奨と書かれている）。現状は画面数が少ないためルーター未使用。導入するかは相談して決める
