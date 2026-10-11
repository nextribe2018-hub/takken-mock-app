// ロジックの簡易テスト: npx tsx scripts/test-logic.ts
import assert from 'node:assert/strict';
import {
  BANK, FIELDS, LESSON, MIX, buildExam, checkQuestions, emptyProgress, finishExam, topicStats, wrongTopics,
  buildRound, choiceOrder, fieldStats, freeExam, finishRound, quotas, reviewQuestions, statsBy, wrongGroups,
} from '../src/logic';
import { EXAMS, byKey } from '../src/exams';

// 1) 5回合計が本試験の比率（業法20・権利14・法令8・税他8）
const sum: Record<string, number> = {};
MIX.forEach(m => Object.entries(m).forEach(([f, n]) => (sum[f] = (sum[f] || 0) + n)));
assert.deepEqual(sum, { 業法: 20, 権利: 14, 法令: 8, 税他: 8 });
MIX.forEach(m => assert.equal(Object.values(m).reduce((a, b) => a + b, 0), 10));

// 2) 各回10問・分野内訳どおり・重複なし（100回試行）
for (let t = 0; t < 100; t++) {
  for (let r = 0; r < 5; r++) {
    const qs = buildExam({}, r);
    assert.equal(qs.length, 10);
    assert.equal(new Set(qs.map(q => q.k)).size, 10);
    FIELDS.forEach(([f]) => assert.equal(qs.filter(q => q.f === f).length, MIX[r][f]));
  }
}

// 3) 5回解くとセットが一周し、合計が返る
let p = emptyProgress();
let last: number[] | null = null;
for (let r = 0; r < 5; r++) {
  const qs = buildExam(p.hist, p.set.round);
  const ans = qs.map(q => q.a); // 全問正解
  const out = finishExam(p, qs, ans, 300);
  assert.equal(out.score, 10);
  p = out.next;
  last = out.setScores;
}
assert.equal(p.set.round, 0);
assert.deepEqual(last, [10, 10, 10, 10, 10]);
assert.equal(p.log.length, 5);
assert.equal(Object.keys(p.hist).length, 50);

// 4) 未出題が優先される：記録済み50問は2周目の最初のセットに出ない
const second = buildExam(p.hist, 0);
assert.ok(second.every(q => !p.hist[q.k]));

// 5) 間違えた論点の抽出と確認例題3問（間違えた問題自体は除外）
const qs = buildExam({}, 0);
const ans = qs.map(q => (q.a ? 0 : 1) as 0 | 1);
const w = wrongTopics(qs, ans);
assert.ok(w.length >= 1);
w.forEach(x => {
  const c = checkQuestions({}, x.key, x.missed.q);
  assert.ok(c.length >= 1 && c.length <= 3);
  assert.ok(c.every(q => q.k !== x.missed.q.k));
});

// 6) すべての論点に解説がある
const missing = topicStats({}).map(s => `${s.f}|${s.t}`).filter(k => !LESSON[k]);
assert.deepEqual(missing, []);

// ---- すべての試験パック共通 ----
const summary: string[] = [];
const freeShort: string[] = [];
for (const x of EXAMS) {
  // 7) 問題データの形：キー一意・分野が定義済み・正解番号が範囲内
  assert.equal(Object.keys(byKey(x)).length, x.items.length, `${x.id}: 安定キーが重複`);
  const fs = new Set(x.fields.map(([f]) => f));
  x.items.forEach(q => {
    assert.ok(fs.has(q.f), `${x.id} ${q.k}: 未定義の分野 ${q.f}`);
    if (x.format === 'ox') assert.ok(q.a === 0 || q.a === 1, `${x.id} ${q.k}: ○×の正解が不正`);
    else {
      assert.ok(q.c && q.c.length >= 4 && q.c.length <= 5, `${x.id} ${q.k}: 選択肢の数`);
      assert.ok(q.a >= 0 && q.a < q.c!.length, `${x.id} ${q.k}: 正解番号が範囲外`);
    }
    if (x.kinds) assert.ok(x.kinds.some(([k]) => k === q.kind), `${x.id} ${q.k}: 出題区分が不正`);
  });

  // 8) 1回分：問題数どおり・重複なし・分野内訳どおり
  for (let t = 0; t < 50; t++) {
    const r = t % (x.rounds?.length || 1);
    const qs = buildRound(x, {}, r);
    assert.equal(qs.length, x.size);
    assert.equal(new Set(qs.map(q => q.k)).size, x.size);
    const mix = quotas(x, r);
    assert.equal(Object.values(mix).reduce((a, b) => a + b, 0), x.size);
    x.fields.forEach(([f]) => assert.equal(qs.filter(q => q.f === f).length, mix[f]));
  }

  // 9) 4択の表示順：全選択肢が1回ずつ・固定肢は末尾
  if (x.format === 'choice') x.items.forEach(q => {
    const o = choiceOrder(q);
    assert.deepEqual([...o].sort(), q.c!.map((_, i) => i));
    if (q.fix) assert.equal(o[o.length - 1], q.c!.length - 1);
  });

  // 10) 採点と記録：全問正解で満点、全問不正解で復習のまとまりが出る
  let pp = emptyProgress();
  const qs = buildRound(x, pp.hist, 0);
  const out = finishRound(x, pp, qs, qs.map(q => q.a), 200);
  assert.equal(out.score, x.size);
  assert.equal(Object.keys(out.next.hist).length, x.size);
  if (!x.rounds) assert.equal(out.next.set.round, 0);
  pp = out.next;
  const second = buildRound(x, pp.hist, pp.set.round);
  assert.ok(second.every(q => !pp.hist[q.k]), `${x.id}: 未出題が優先されていない`);
  const wrongAns = qs.map(q => (x.format === 'ox' ? 1 - q.a : (q.a + 1) % q.c!.length));
  const wg = wrongGroups(x, qs, wrongAns);
  assert.ok(wg.length >= 1);
  wg.forEach(g => {
    const rv = reviewQuestions(x, {}, g.key, g.missed.q);
    assert.ok(rv.length >= 1 && rv.every(q => q.k !== g.missed.q.k && q.f === g.missed.q.f));
  });
  assert.equal(statsBy(x, out.next.hist).reduce((a, s) => a + s.n, 0), x.size);
  // 11) 分野ごとの集計：全分野がそろい、問題数・解答数の合計が一致
  const fst = fieldStats(x, out.next.hist);
  assert.equal(fst.length, x.fields.length);
  assert.equal(fst.reduce((a, s) => a + s.total, 0), x.items.length);
  assert.equal(fst.reduce((a, s) => a + s.n, 0), x.size);
  // 12) 無料版：分野ごとに10分の1（切り上げ）・全分野を含む・1回分が無料の問題だけで組める
  const fx = freeExam(x);
  x.fields.forEach(([f]) => {
    const n = x.items.filter(q => q.f === f).length;
    assert.equal(fx.items.filter(q => q.f === f).length, Math.ceil(n / 10), `${x.id} ${f}: 無料の問題数`);
  });
  const freeKeys = new Set(fx.items.map(q => q.k));
  for (let t = 0; t < 20; t++) {
    const fr = buildRound(fx, {}, t % (x.rounds?.length || 1));
    assert.equal(fr.length, Math.min(x.size, fx.items.length));
    assert.ok(fr.every(q => freeKeys.has(q.k)), `${x.id}: 無料版に有料の問題が混ざった`);
  }
  if (fx.items.length < x.size) freeShort.push(`${x.short}(${fx.items.length}問)`);
  summary.push(`${x.short}${x.items.length}問`);
}

console.log(`OK: ${BANK.length}問・${Object.keys(LESSON).length}論点・すべてのテストに合格`);
console.log(`OK: 試験パック ${summary.join('・')}`);
if (freeShort.length) console.log(`注意: 無料版が1回分（10問）に満たない試験 ${freeShort.join('・')}`);
