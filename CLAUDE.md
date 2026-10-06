# CLAUDE.md

宅建（宅地建物取引士）試験の 10分模試アプリ。Expo（SDK 57）＋ React Native ＋ TypeScript。
App Store で「無料＋買い切り解除」で公開するのが目標。

**作業を始める前に `docs/HANDOFF.md` を読むこと。** 現状・決定事項・未決事項・データ仕様・TODO がまとまっている。

## 応答のルール
- 日本語で回答する。提案は表か箇条書きで
- 結論の理由を示す。分からないことは分からないと言う
- 変更したら `npm test` と `npm run typecheck` を通してから報告する
- 仕様（出題比率・判定基準・復習の流れ）を変えるときは先に確認する
- 問題の安定キー（`分野|論点|出典`）は変えない。学習記録が壊れる

## コマンド
```bash
npm install
npx expo start
npm test
npm run typecheck
python3 web/build.py   # Web版（Claudeアーティファクト用HTML）を再生成
```

## 構成
- `App.tsx` 画面 ／ `src/logic.ts` ロジック ／ `src/storage.ts` 保存 ／ `src/theme.ts` 色
- `src/data/bank.json` 問題532問 ／ `src/data/lessons.json` 解説46論点
- `web/` Web版のテンプレートとビルド

## 注意
- `npx expo install` が失敗する環境では `expo/bundledNativeModules.json` の版を `npm install` で指定する
- 宣伝文・説明文で「合格保証」等の表現は使わない
- `AGENTS.md` は create-expo-app の既定ファイル（Expo Router 推奨と書かれている）。現状は画面数が少ないためルーター未使用。導入するかは相談して決める
