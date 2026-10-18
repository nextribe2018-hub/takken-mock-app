<?php
// 1分トライアルのランキング API（Xserver の PHP＋MySQL で動く小さなもの）
// 共通：DB 接続、JSON の入出力、検証。各エンドポイントは score.php／rank.php／nick.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$CONFIG = require __DIR__ . '/config.php';

function db(): PDO {
  static $pdo = null;
  global $CONFIG;
  if ($pdo === null) {
    $pdo = new PDO($CONFIG['dsn'], $CONFIG['user'] ?? null, $CONFIG['pass'] ?? null, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
  }
  return $pdo;
}

function out(array $data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $code = 400): void { out(['error' => $msg], $code); }

function body(): array {
  $raw = file_get_contents('php://input');
  $d = json_decode($raw ?: '{}', true);
  return is_array($d) ? $d : [];
}

// 端末ごとの匿名ID（アプリが作る32文字の16進）
function validId($v): ?string { return is_string($v) && preg_match('/^[0-9a-f]{32}$/', $v) ? $v : null; }
function validPack($v): ?string { return is_string($v) && preg_match('/^[a-z0-9-]{1,20}$/', $v) ? $v : null; }
function validLv($v): ?string { return is_string($v) && mb_strlen($v) >= 1 && mb_strlen($v) <= 10 ? $v : null; }
function validDir($v): ?string { return $v === 'ej' || $v === 'je' ? $v : null; }

// ニックネーム：1〜12文字、制御文字なし、禁止語を含まない
function validNick($v): ?string {
  global $CONFIG;
  if (!is_string($v)) return null;
  $v = trim(preg_replace('/\s+/u', ' ', $v));
  $n = mb_strlen($v);
  if ($n < 1 || $n > 12 || preg_match('/[\x00-\x1f\x7f]/', $v)) return null;
  foreach ($CONFIG['ng_words'] ?? [] as $w) { if ($w !== '' && mb_stripos($v, $w) !== false) return null; }
  return $v;
}

// 級・向きごとの統計：順位（各人のベストの中で）、人数、平均・標準偏差（全記録）、上位10人
function stats(string $pack, string $lv, string $dir, ?string $id): array {
  $db = db();
  $q = $db->prepare('SELECT player, MAX(score) AS best FROM scores WHERE pack=? AND lv=? AND dir=? GROUP BY player');
  $q->execute([$pack, $lv, $dir]);
  $bests = $q->fetchAll();
  $total = count($bests);
  $mine = null;
  foreach ($bests as $b) { if ($id !== null && $b['player'] === $id) { $mine = (int)$b['best']; break; } }
  $rank = null;
  if ($mine !== null) { $rank = 1; foreach ($bests as $b) { if ((int)$b['best'] > $mine) $rank++; } }
  $s = $db->prepare('SELECT COUNT(*) AS n, AVG(score) AS mu, STDDEV_POP(score) AS sd FROM scores WHERE pack=? AND lv=? AND dir=?');
  try { $s->execute([$pack, $lv, $dir]); $agg = $s->fetch(); }
  catch (Throwable $e) { // SQLite には STDDEV_POP がない（ローカル検証用）
    $s = $db->prepare('SELECT score FROM scores WHERE pack=? AND lv=? AND dir=?'); $s->execute([$pack, $lv, $dir]);
    $xs = array_map('intval', array_column($s->fetchAll(), 'score')); $n = count($xs); $mu = $n ? array_sum($xs) / $n : null;
    $sd = $n ? sqrt(array_sum(array_map(fn($x) => ($x - $mu) ** 2, $xs)) / $n) : null;
    $agg = ['n' => $n, 'mu' => $mu, 'sd' => $sd];
  }
  $t = $db->prepare('SELECT s.player, p.nick, MAX(s.score) AS best FROM scores s JOIN players p ON p.id = s.player WHERE s.pack=? AND s.lv=? AND s.dir=? GROUP BY s.player, p.nick ORDER BY best DESC, MIN(s.at) ASC LIMIT 10');
  $t->execute([$pack, $lv, $dir]);
  $top = array_map(fn($r) => ['nick' => $r['nick'] ?: '学習者', 'score' => (int)$r['best'], 'me' => $id !== null && $r['player'] === $id], $t->fetchAll());
  return [
    'rank' => $rank, 'total' => $total, 'best' => $mine,
    'n' => (int)($agg['n'] ?? 0), 'mu' => $agg['mu'] !== null ? round((float)$agg['mu'], 2) : null, 'sd' => $agg['sd'] !== null ? round((float)$agg['sd'], 2) : null,
    'top' => $top,
  ];
}
