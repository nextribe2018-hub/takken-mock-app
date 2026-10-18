-- 1分トライアルのランキング（MySQL 5.7 以上／MariaDB）。phpMyAdmin で実行する
CREATE TABLE IF NOT EXISTS players (
  id CHAR(32) NOT NULL PRIMARY KEY,          -- 端末ごとの匿名ID（アプリが作る）
  nick VARCHAR(12) NULL,                     -- ニックネーム（未登録なら NULL → 「学習者」と表示）
  created_at DATETIME NOT NULL,
  last_at DATETIME NULL                      -- 最後に得点を送った時刻（連続投稿の抑制）
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scores (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player CHAR(32) NOT NULL,
  pack VARCHAR(20) NOT NULL,                 -- eitango／jukugo／chugokugo／futsugo
  lv VARCHAR(10) NOT NULL,                   -- 級（5級、HSK1級 など）
  dir CHAR(2) NOT NULL,                      -- ej＝外国語→和、je＝和→外国語
  n TINYINT UNSIGNED NOT NULL,               -- 出題数
  ok TINYINT UNSIGNED NOT NULL,              -- 正解数
  remain TINYINT UNSIGNED NOT NULL,          -- 余った秒
  score TINYINT UNSIGNED NOT NULL,           -- ok + remain
  sec DECIMAL(4,1) NOT NULL,                 -- かかった秒
  at DATETIME NOT NULL,
  INDEX idx_rank (pack, lv, dir, score),
  INDEX idx_player (player),
  CONSTRAINT fk_player FOREIGN KEY (player) REFERENCES players(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
