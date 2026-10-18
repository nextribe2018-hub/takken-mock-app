<?php
// POST：トライアル1回の得点を記録し、順位・人数・分布を返す
// 入力 {id, nick?, pack, lv, dir, n, ok, remain, score, sec}
declare(strict_types=1);
require __DIR__ . '/lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST only', 405);
$b = body();
$id = validId($b['id'] ?? null); $pack = validPack($b['pack'] ?? null); $lv = validLv($b['lv'] ?? null); $dir = validDir($b['dir'] ?? null);
if (!$id || !$pack || !$lv || !$dir) fail('bad request');
$n = (int)($b['n'] ?? 0); $ok = (int)($b['ok'] ?? -1); $remain = (int)($b['remain'] ?? -1); $score = (int)($b['score'] ?? -1); $sec = (float)($b['sec'] ?? 0);
// 得点の整合性：30語以内、正解は語数以内、余りは60秒以内、得点＝正解＋余り
if ($n < 1 || $n > 30 || $ok < 0 || $ok > $n || $remain < 0 || $remain > 60 || $score !== $ok + $remain || $sec < 0 || $sec > 60) fail('bad score');
if ($remain > 0 && $remain > 60 - floor($sec)) fail('bad score');

$db = db();
$db->beginTransaction();
try {
  $p = $db->prepare('SELECT nick, last_at FROM players WHERE id=?'); $p->execute([$id]); $row = $p->fetch();
  $nick = validNick($b['nick'] ?? null);
  if (!$row) {
    $db->prepare('INSERT INTO players (id, nick, created_at, last_at) VALUES (?, ?, ?, ?)')->execute([$id, $nick, gmdate('Y-m-d H:i:s'), gmdate('Y-m-d H:i:s')]);
  } else {
    // 連続投稿の抑制：前回から20秒未満は受け付けない（1分トライアルなら必ず空く）
    if ($row['last_at'] && time() - strtotime($row['last_at'] . ' UTC') < 20) fail('too fast', 429);
    $db->prepare('UPDATE players SET nick = COALESCE(?, nick), last_at=? WHERE id=?')->execute([$nick, gmdate('Y-m-d H:i:s'), $id]);
  }
  $db->prepare('INSERT INTO scores (player, pack, lv, dir, n, ok, remain, score, sec, at) VALUES (?,?,?,?,?,?,?,?,?,?)')
     ->execute([$id, $pack, $lv, $dir, $n, $ok, $remain, $score, $sec, gmdate('Y-m-d H:i:s')]);
  $db->commit();
} catch (Throwable $e) { $db->rollBack(); fail('db error', 500); }
out(stats($pack, $lv, $dir, $id));
