<?php
// GET：級・向きの順位・人数・分布・上位10人。?pack=eitango&lv=5級&dir=ej&id=<匿名ID>
declare(strict_types=1);
require __DIR__ . '/lib.php';
$pack = validPack($_GET['pack'] ?? null); $lv = validLv($_GET['lv'] ?? null); $dir = validDir($_GET['dir'] ?? null);
if (!$pack || !$lv || !$dir) fail('bad request');
out(stats($pack, $lv, $dir, validId($_GET['id'] ?? null)));
