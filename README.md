# 宅建 10分模試（iOS / Android アプリ）

本試験と同じ分野比率で10問を10分。5回で50問＝本試験1回分。
間違えた論点は「解説 → 付随する論点 → 確認例題3問」で復習します。

## 構成

| ファイル | 内容 |
|---|---|
| `App.tsx` | 画面（ホーム／試験／結果／解説／確認例題） |
| `src/logic.ts` | 出題比率・出題選択・採点・習熟度の判定 |
| `src/storage.ts` | 学習記録の保存（端末内。クラウド同期はここに追加予定） |
| `src/theme.ts` | 色（ライト／ダーク）とフォント |
| `src/data/bank.json` | 問題 1,498問（○×形式） |
| `src/data/lessons.json` | 46論点の解説・ひっかけ・付随論点 |
| `scripts/test-logic.ts` | ロジックのテスト |

## 手元で動かす（Mac）

```bash
git clone https://github.com/nextribe2018-hub/takken-mock-app.git
cd takken-mock-app
npm install
npx expo start
```

表示されたQRコードを iPhone のカメラで読み取ると、「Expo Go」アプリで開けます（App Storeで Expo Go を先に入れておく）。

## 確認コマンド

```bash
npm test          # 出題比率・採点・復習のテスト
npm run typecheck # 型チェック
```

## 公開までに残っている作業

- [ ] 解説の書き直し（自分の言葉で）・専門家チェック
- [ ] 過去問の利用条件を実施機関に確認
- [ ] 買い切り課金（無料版の範囲と解除）
- [ ] クラウド同期とアカウント削除
- [ ] アイコン・スクリーンショット・プライバシーポリシー
- [ ] EAS Build → TestFlight → 審査提出
