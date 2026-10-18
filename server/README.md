# 1分トライアルのランキング API（Xserver 用）

PHP＋MySQL だけで動く小さな API。アプリは得点を匿名IDで送り、順位・人数・分布（偏差値の元）・上位10人を受け取る。

| ファイル | 役割 |
|---|---|
| `api/score.php` | POST 得点を記録して順位・分布を返す |
| `api/rank.php` | GET 級・向きの順位・分布・上位10人 |
| `api/nick.php` | POST ニックネームの登録（1〜12文字、禁止語は `config.php`） |
| `api/lib.php` | 共通（DB・検証・統計） |
| `api/schema.sql` | テーブル定義（phpMyAdmin で実行） |
| `api/config.sample.php` | 接続情報の雛形。`config.php` にコピーして使う（Git には入れない） |
| `api/.htaccess` | 設定・SQL を外から読めなくする |

## Xserver に置く手順（1回だけ）
1. サーバーパネル「MySQL設定」で DB とユーザーを作り、ユーザーに DB のアクセス権を付ける
2. 「phpMyAdmin」でその DB を開き、`schema.sql` の中身を SQL タブで実行
3. 「ファイルマネージャ」か FTP で `server/api/` の中身を `ドメイン/public_html/api/` にアップロード
4. `config.sample.php` を `config.php` にコピーし、ホスト名・DB名・ユーザー名・パスワードを入れる
5. ブラウザで `https://ドメイン/api/rank.php?pack=eitango&lv=5級&dir=ej` を開き、`{"rank":null,"total":0,...}` が返れば完了
6. アプリ側は `EXPO_PUBLIC_RANK_URL=https://ドメイン/api` を付けてビルド（`eas.json` の env か `.env`）。未設定なら全国ランキングの機能は出ず、端末内の記録だけになる

## 仕様
- 順位：級・向きごとに、各参加者のベスト得点で比べる
- 偏差値：級・向きごとの全記録の平均・標準偏差から（記録が30回未満のあいだはアプリ内の仮の基準）
- 検証：出題数≤30、正解≤出題数、余り≤60、得点＝正解＋余り、同じ端末からの連続投稿は20秒あける
- 個人情報：匿名ID（端末が作る32文字）とニックネームだけ。メール・端末情報は送らない
