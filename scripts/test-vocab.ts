// 英単語モードのテスト: npx tsx scripts/test-vocab.ts
import assert from 'node:assert/strict';
import {
  LEVELS, ROUND_SIZE, FIX_EVERY, CHOICES, TEST_SEC, BONUS_SEC, REVIEW_MAX, emptyLevel, ensureOrd, nextWords, planRound, statusOf, counts, buildTest, scoreOf, finishRound, fixDue, fixWords, finishFix, skipFix, stats, rng, judge,
} from '../src/vocab';

// 1) データ：5レベル・各300語・語の重複なし・意味と品詞がある
assert.equal(LEVELS.length, 5);
assert.deepEqual(LEVELS.map(l => l.id), ['toeic500', 'toeic600', 'toeic700', 'toeic800', 'toeic900']);
for (const L of LEVELS) {
  assert.equal(L.words.length, 300, `${L.id}: ${L.words.length}語`);
  assert.equal(new Set(L.words.map(w => w.w)).size, 300, `${L.id}: 語が重複`);
  L.words.forEach(w => assert.ok(w.w && w.m && w.p, `${L.id}: ${w.w} の意味・品詞が空`));
  assert.ok(/^toeic[5-9]00$/.test(L.id) && L.name.startsWith('TOEIC ') && L.ref, `${L.id}: id は toeic500〜900、ref（参考レベル）が必要`);
  assert.equal(300 % ROUND_SIZE, 0);
}

// 2) 1周目：ランダムな出題順（固定）で、復習がなければまだ出ていない語から30語ずつ。300語で全部出る
const L = LEVELS[0];
let lp = ensureOrd(L, emptyLevel(), rng(3));
assert.equal(ensureOrd(L, lp), lp, 'ord があれば作り直さない');
assert.notDeepEqual(nextWords(L, lp).map(w => w.w), L.words.slice(0, 30).map(w => w.w), 'ABC順（元の並び）ではない');
const seen: string[] = [];
for (let i = 0; i < 10; i++) {
  const ws = nextWords(L, lp);
  assert.equal(ws.length, ROUND_SIZE);
  assert.ok(ws.every(w => statusOf(lp.hist[w.w]) === 'new'), '全問正解なら復習は入らない');
  seen.push(...ws.map(w => w.w));
  const out = finishRound(lp, L, ws.map(w => ({ w, ok: true, answered: true })), 20);
  lp = out.next;
  assert.equal(out.log.score, 20 + 30);
  assert.equal(out.fixDue, i === 9, `定着テストは300語目だけ (i=${i})`);
}
assert.equal(new Set(seen).size, 300);
assert.equal(lp.learned, 300);
assert.ok(fixDue(lp));

// 3) 直近5回の成績と判定（◯=1 ✖=0 △=2、古い→新しい）
const S = (r: string) => statusOf({ n: 0, c: 0, last: 0, r });
assert.equal(S('11111'), 'fixed');
assert.equal(S('00111'), 'fixed', '✖✖◯◯◯ は定着');
assert.equal(S('01100'), 'redo', '✖◯◯✖✖ は要再習得');
assert.equal(S('1101'), 'mid');
assert.equal(S('0001'), 'redo', '✖が◯より多い');
assert.equal(S('1'), 'mid');
assert.equal(S('22'), 'na');
assert.equal(S('11211'), 'fixed', '△は判定から除く');
assert.equal(statusOf({ n: 2, c: 1, last: 0 }), 'redo', 'r がない旧記録は最後の結果');
assert.equal(statusOf(undefined), 'new');
{
  // 未回答は△として残し、正誤の回数に入れない。5回を超えたら古いものから消える
  const w = L.words[0];
  let q = emptyLevel();
  for (const [ok, answered] of [[1, 1], [0, 1], [0, 0], [1, 1], [1, 1], [1, 1]] as const) {
    q = finishRound(q, L, [{ w, ok: !!ok, answered: !!answered }], 0, true).next;
  }
  assert.equal(q.hist[w.w].r, '02111');
  assert.equal(q.hist[w.w].n, 5);
  assert.equal(q.hist[w.w].c, 4);
  assert.equal(statusOf(q.hist[w.w]), 'fixed');
}

// 4) 次の30語：要再習得・未回答の語を最大9語＋まだ出ていない語
{
  let q = ensureOrd(L, emptyLevel(), rng(5));
  const w1 = nextWords(L, q);
  const out = finishRound(q, L, w1.map((w, j) => ({ w, ok: j >= 12, answered: j < 6 || j >= 12 })), 0); // 6語✖・6語△・18語◯
  q = out.next;
  assert.deepEqual(out.log.wrong.length, 6);
  assert.deepEqual(out.log.na!.length, 6);
  const plan = planRound(L, q);
  assert.equal(plan.words.length, 30);
  assert.equal(plan.review.size, REVIEW_MAX);
  assert.equal(plan.fresh, 30 - REVIEW_MAX);
  const rv = plan.words.filter(w => plan.review.has(w.w));
  assert.ok(rv.slice(0, 6).every(w => statusOf(q.hist[w.w]) === 'redo'), '要再習得が先');
  assert.ok(rv.slice(6).every(w => statusOf(q.hist[w.w]) === 'na'), '次に未回答のみ');
  assert.equal(counts(L, q).mid, 18);
}

// 5) 定着テスト：要再習得などの語だけ、最大30語。実施すると fixDue が消える
{
  let q = ensureOrd(L, emptyLevel(), rng(9));
  for (let i = 0; i < 10; i++) {
    const ws = nextWords(L, q);
    q = finishRound(q, L, ws.map((w, j) => ({ w, ok: j % 5 !== 0, answered: true })), 20).next;
  }
  assert.ok(fixDue(q));
  const fw = fixWords(L, q);
  assert.ok(fw.length > 0 && fw.length <= 30);
  fw.forEach(w => assert.notEqual(statusOf(q.hist[w.w]), 'fixed'));
  const fx = finishFix(q, fw.map(w => ({ w, ok: true, answered: true })), 30);
  assert.equal(fx.log.kind, 'fix');
  assert.ok(!fixDue(fx.next));
  assert.equal(fx.next.learned, q.learned, '定着テストで learned は進まない');
  assert.ok(!fixDue(skipFix({ ...emptyLevel(), learned: FIX_EVERY })));
}

// 6) 全部出たあとは 習得中 → 定着（出題が古い順）
{
  const plan = planRound(L, lp);   // 2) で全問正解1回ずつ＝全語「習得中」
  assert.equal(plan.fresh, 0);
  assert.equal(plan.words.length, 30);
  assert.ok(plan.words.every(w => statusOf(lp.hist[w.w]) === 'mid'));
}

// 7) テスト問題：4択・正解を含む・選択肢に重複なし・30問
const qs = buildTest(nextWords(L, ensureOrd(L, emptyLevel(), rng(1))), L, rng(7));
assert.equal(qs.length, 30);
qs.forEach(q => {
  assert.equal(q.choices.length, CHOICES);
  assert.equal(new Set(q.choices).size, CHOICES);
  assert.equal(q.choices[q.a], q.w.m);
});
// 同じ seed なら同じ出題
assert.deepEqual(buildTest(nextWords(L, ensureOrd(L, emptyLevel(), rng(1))), L, rng(7)).map(q => q.choices), qs.map(q => q.choices));

// 8) 得点：残り秒は切り捨て＋正解数。時間切れは残り0。正解で延びる秒
assert.equal(scoreOf(12.9, 20), 32);
assert.equal(scoreOf(-3, 10), 10);
assert.equal(scoreOf(0.49, 0), 0);
assert.equal(TEST_SEC + ROUND_SIZE * BONUS_SEC, 75); // 全問正解で最大75秒ぶん時計が進む

// 9) 時間切れ（未解答あり）の記録
{
  const ws = nextWords(L, ensureOrd(L, emptyLevel(), rng(1)));
  const res = ws.map((w, j) => ({ w, ok: j < 10, answered: j < 15 }));
  const out = finishRound(emptyLevel(), L, res, -0.2);
  assert.equal(out.log.left, 0);
  assert.equal(out.log.asked, 15);
  assert.equal(out.log.score, 10);
  assert.equal(out.log.wrong.length, 5, '答えて間違えた語だけ');
  assert.equal(out.log.na!.length, 15);
}

// 10) 記録のまとめ
const s = stats(L, lp);
assert.equal(s.rounds, 10);
assert.equal(s.best, 50);
assert.equal(s.total, 300);
assert.equal(s.cnt.mid, 300);
assert.equal(s.wrongCount, 0);
assert.ok(judge(80, 30, 30).startsWith('完璧'));

console.log(`OK: 英単語 ${LEVELS.map(l => `${l.name} ${l.words.length}語`).join('・')}・すべてのテストに合格`);

// 11) 同じ30語のやり直し（repeat）は cursor・learned を進めない
{
  const ws = nextWords(L, ensureOrd(L, emptyLevel(), rng(1)));
  const a = finishRound(emptyLevel(), L, ws.map(w => ({ w, ok: false, answered: true })), 10);
  const b = finishRound(a.next, L, ws.map(w => ({ w, ok: true, answered: true })), 10, true);
  assert.equal(b.next.learned, 30);
  assert.equal(b.next.hist[ws[0].w].r, '01');
  assert.equal(b.next.log.length, 2);
  assert.equal(b.next.hist[ws[0].w].n, 2);
}
