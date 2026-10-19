// 英単語モードのテスト: npx tsx scripts/test-vocab.ts
import assert from 'node:assert/strict';
import {
  LEVELS, ROUND_SIZE, FIX_EVERY, CHOICES, TEST_SEC, BONUS_SEC, emptyLevel, nextWords, buildTest, scoreOf, finishRound, fixDue, fixWords, finishFix, skipFix, stats, rng, weakOrder, judge,
} from '../src/vocab';

// 1) データ：5レベル・各300語・語の重複なし・意味と品詞がある
assert.equal(LEVELS.length, 5);
for (const L of LEVELS) {
  assert.equal(L.words.length, 300, `${L.id}: ${L.words.length}語`);
  assert.equal(new Set(L.words.map(w => w.w)).size, 300, `${L.id}: 語が重複`);
  L.words.forEach(w => assert.ok(w.w && w.m && w.p, `${L.id}: ${w.w} の意味・品詞が空`));
  assert.equal(300 % ROUND_SIZE, 0);
}

// 2) 30語ずつ順に出て、300語で一周する
const L = LEVELS[0];
let lp = emptyLevel();
const seen: string[] = [];
for (let i = 0; i < 10; i++) {
  const ws = nextWords(L, lp);
  assert.equal(ws.length, ROUND_SIZE);
  assert.deepEqual(ws.map(w => w.w), L.words.slice(i * 30, i * 30 + 30).map(w => w.w));
  seen.push(...ws.map(w => w.w));
  const res = ws.map((w, j) => ({ w, ok: j % 5 !== 0, answered: true })); // 30語中6語を間違える
  const out = finishRound(lp, L, res, 20);
  lp = out.next;
  assert.equal(out.log.correct, 24);
  assert.equal(out.log.score, 20 + 24);
  assert.equal(out.fixDue, i === 9, `定着テストは300語目だけ (i=${i})`);
}
assert.equal(new Set(seen).size, 300);
assert.equal(lp.cursor, 0);
assert.equal(lp.learned, 300);
assert.ok(fixDue(lp));

// 3) 定着テスト：過去に間違えた語だけ、最大30語。実施すると fixDue が消える
const fw = fixWords(L, lp);
assert.equal(fw.length, 30);
fw.forEach(w => { const h = lp.hist[w.w]; assert.ok(h && h.c < h.n, `${w.w} は間違えていない`); });
const fx = finishFix(lp, fw.map(w => ({ w, ok: true, answered: true })), 30);
lp = fx.next;
assert.equal(fx.log.kind, 'fix');
assert.ok(!fixDue(lp));
assert.equal(lp.cursor, 0, '定着テストで cursor は進まない');
// 間違いがないときは skipFix で済ませられる
assert.ok(!fixDue(skipFix({ ...emptyLevel(), learned: FIX_EVERY })));

// 4) 2周目は間違いの多い語が先頭に来る
const second = nextWords(L, lp);
const order = weakOrder(L, lp);
assert.deepEqual(second.map(w => w.w), order.slice(0, 30).map(w => w.w));
assert.ok(second.every(w => { const h = lp.hist[w.w]; return h && h.c < h.n; }), '2周目の先頭30語はすべて誤答歴のある語');

// 5) テスト問題：4択・正解を含む・選択肢に重複なし・30問
const qs = buildTest(nextWords(L, emptyLevel()), L, rng(7));
assert.equal(qs.length, 30);
qs.forEach(q => {
  assert.equal(q.choices.length, CHOICES);
  assert.equal(new Set(q.choices).size, CHOICES);
  assert.equal(q.choices[q.a], q.w.m);
});
// 同じ seed なら同じ出題
assert.deepEqual(buildTest(nextWords(L, emptyLevel()), L, rng(7)).map(q => q.choices), qs.map(q => q.choices));

// 6) 得点：残り秒は切り捨て＋正解数。時間切れは残り0。正解で延びる秒
assert.equal(scoreOf(12.9, 20), 32);
assert.equal(scoreOf(-3, 10), 10);
assert.equal(scoreOf(0.49, 0), 0);
assert.equal(TEST_SEC + ROUND_SIZE * BONUS_SEC, 75); // 全問正解で最大75秒ぶん時計が進む

// 7) 時間切れ（未解答あり）の記録
{
  const ws = nextWords(L, emptyLevel());
  const res = ws.map((w, j) => ({ w, ok: j < 10, answered: j < 15 }));
  const out = finishRound(emptyLevel(), L, res, -0.2);
  assert.equal(out.log.left, 0);
  assert.equal(out.log.asked, 15);
  assert.equal(out.log.score, 10);
  assert.equal(out.log.wrong.length, 20);
}

// 8) 記録のまとめ
const s = stats(L, lp);
assert.equal(s.rounds, 10);
assert.equal(s.fixes, 1);
assert.equal(s.best, 44);
assert.equal(s.total, 300);
assert.ok(s.wrongCount >= 30);
assert.ok(judge(80, 30, 30).startsWith('完璧'));

console.log(`OK: 英単語 ${LEVELS.map(l => `${l.name} ${l.words.length}語`).join('・')}・すべてのテストに合格`);

// 9) 同じ30語のやり直し（repeat）は cursor・learned を進めない
{
  const ws = nextWords(L, emptyLevel());
  const a = finishRound(emptyLevel(), L, ws.map(w => ({ w, ok: false, answered: true })), 10);
  const b = finishRound(a.next, L, ws.map(w => ({ w, ok: true, answered: true })), 10, true);
  assert.equal(b.next.cursor, 30);
  assert.equal(b.next.learned, 30);
  assert.equal(b.next.log.length, 2);
  assert.equal(b.next.hist[ws[0].w].n, 2);
}
