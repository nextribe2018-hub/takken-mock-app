<?php
// config.php にコピーして、Xserver の MySQL の値を入れる（config.php は Git に入れない）
return [
  // Xserver：サーバーパネル「MySQL設定」のホスト名・DB名・ユーザー名・パスワード
  'dsn'  => 'mysql:host=mysqlXXXX.xserver.jp;dbname=XXXX_tango;charset=utf8mb4',
  'user' => 'XXXX_tango',
  'pass' => 'パスワード',
  // ニックネームに含めない語（必要に応じて足す）
  'ng_words' => ['死ね', '殺す', 'fuck', 'shit'],
];
