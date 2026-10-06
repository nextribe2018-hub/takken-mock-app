// ロジックの簡易テスト: npx tsx scripts/test-logic.ts
import assert from 'node:assert/strict';
import {
  BANK, FIELDS, LESSON, MIX, buildExam, checkQuestions, emptyProgress, finishExam, topicStats, wrongTopics,
} from '../src/logic';

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

console.log(`OK: ${BANK.length}問・${Object.keys(LESSON).length}論点・すべてのテストに合格`);
