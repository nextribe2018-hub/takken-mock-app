<?php
// POST：ニックネームの登録・変更 {id, nick}。使えない名前なら 400
declare(strict_types=1);
require __DIR__ . '/lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST only', 405);
$b = body();
$id = validId($b['id'] ?? null); $nick = validNick($b['nick'] ?? null);
if (!$id) fail('bad request');
if (!$nick) fail('bad nick');
$db = db();
$now = gmdate('Y-m-d H:i:s');
$p = $db->prepare('SELECT id FROM players WHERE id=?'); $p->execute([$id]);
if ($p->fetch()) $db->prepare('UPDATE players SET nick=? WHERE id=?')->execute([$nick, $id]);
else $db->prepare('INSERT INTO players (id, nick, created_at, last_at) VALUES (?,?,?,NULL)')->execute([$id, $nick, $now]);
out(['nick' => $nick]);
