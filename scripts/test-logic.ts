// ロジックの簡易テスト: npx tsx scripts/test-logic.ts
import assert from 'node:assert/strict';
import {
  BANK, FIELDS, LESSON, MIX, buildExam, buildFieldExam, finishFieldExam, passEstimate, record, backfillRecent, relatedBranch, toExam, relatedRows, relatedTraps, checkQuestions, emptyProgress, finishExam, topicStats, wrongTopics,
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


// 7) 全論点に体系解説（全体像・表）があり、表の列数がそろっている
Object.entries(LESSON).forEach(([k, L]) => {
  assert.ok(L.sys, `体系解説なし: ${k}`);
  assert.ok(L.sys!.tree.length >= 3 && L.sys!.tables.length >= 1, `体系解説が薄い: ${k}`);
  L.sys!.tables.forEach(t => t.rows.forEach(r => assert.equal(r.length, t.head.length, `${k} ${t.title}`)));
});
// 8) 間違えた問題に関係する枝が見つかる（全問題で枝番号が範囲内）
let found = 0;
BANK.forEach(q => { const s = LESSON[`${q.f}|${q.t}`].sys!; const h = relatedBranch(s, q); assert.ok(h.branch < s.tree.length); if (h.branch >= 0) found++; });
console.log(`体系図の該当枝が見つかった問題: ${found} / ${BANK.length}`);

// 9) 絞り込み解説：表の抜粋は最大4行で元の表の行に含まれる、ひっかけは最大2件
let withRows = 0;
BANK.forEach(q => {
  const L = LESSON[`${q.f}|${q.t}`];
  const r = relatedRows(L.sys!, q);
  if (r) { withRows++; assert.ok(r.rows.length >= 1 && r.rows.length <= 4); r.rows.forEach(row => assert.ok(r.table.rows.includes(row))); }
  const tr = relatedTraps(L, q); assert.ok(tr.length <= 2); tr.forEach(x => assert.ok(L.traps.includes(x)));
});
console.log(`関係する表の行が見つかった問題: ${withRows} / ${BANK.length}`);

// 10) 分野別10問：その分野だけ・10問・重複なし。採点しても5回セットは動かない
FIELDS.forEach(([f]) => {
  const qs = buildFieldExam({}, f);
  assert.equal(qs.length, 10); assert.ok(qs.every(q => q.f === f)); assert.equal(new Set(qs.map(q => q.k)).size, 10);
  const pr = emptyProgress(); const r = finishFieldExam(pr, f, qs, qs.map(q => q.a), 120);
  assert.equal(r.score, 10); assert.deepEqual(r.next.set, pr.set); assert.equal(r.next.log.at(-1)!.field, f);
});
// 11) 合格の見込み：30問未満は判定しない、正答率が高いほど確率・予想点が上がる
assert.equal(passEstimate({}).ready, false);
const sim = (rate: number) => { const h: Record<string, { n: number; c: number; last: 0 | 1 }> = {};
  BANK.forEach((q, i) => { if (i % 3) return; const ok = ((i * 7919) % 100) / 100 < rate; h[q.k] = { n: 1, c: ok ? 1 : 0, last: ok ? 1 : 0 }; }); return passEstimate(h); };
const lo = sim(0.6), mid = sim(0.8), hi = sim(0.92);
assert.ok(lo.ready && mid.ready && hi.ready);
if (lo.ready && mid.ready && hi.ready) {
  assert.ok(lo.prob <= mid.prob && mid.prob <= hi.prob && lo.mean < mid.mean && mid.mean < hi.mean);
  console.log(`合格の見込み 正答率60%→${Math.round(lo.prob * 100)}%（${lo.mean.toFixed(1)}点） 80%→${Math.round(mid.prob * 100)}%（${mid.mean.toFixed(1)}点） 92%→${Math.round(hi.prob * 100)}%（${hi.mean.toFixed(1)}点）`);
}

// 12) ○×→4択の換算（消去法込み）：全問正解なら1。○×80%→慎重62%・標準71%・消去法82%。p・k に対して単調増加
assert.ok(Math.abs(toExam(1) - 1) < 1e-9);
assert.ok(Math.abs(toExam(0.8, 0) - 0.616) < 0.002 && Math.abs(toExam(0.85, 0) - 0.700) < 0.002);
assert.ok(Math.abs(toExam(0.8, 0.5) - 0.714) < 0.002 && Math.abs(toExam(0.8, 1) - 0.818) < 0.002);
for (let p = 0.3; p < 0.95; p += 0.05) for (const k of [0, 0.5, 1]) assert.ok(toExam(p + 0.05, k) > toExam(p, k));
for (const p of [0.6, 0.7, 0.8, 0.9]) assert.ok(toExam(p, 0) < toExam(p, 0.5) && toExam(p, 0.5) < toExam(p, 1));

// 13) 論点ごとの直近10問：記録は最大10件・新しいものが末尾。合格確率は直近で計算
{
  let p = emptyProgress(); const q = BANK[0];
  for (let i = 0; i < 12; i++) p = record(p, q, i % 3 !== 0);
  const r = p.r10[`${q.f}|${q.t}`];
  assert.equal(r, '1011011011'); // 12回のうち新しい10回（古い→新しい）
  assert.equal(p.hist[q.k].n, 12);
  // 既存データの補完：各問の最後の結果を使う
  const bf = backfillRecent({ [q.k]: { n: 3, c: 1, last: 0 } });
  assert.equal(bf[`${q.f}|${q.t}`], '0');
  // 全体は低いが直近が高い → 直近の方が合格確率が高い
  const h: Record<string, { n: number; c: number; last: 0 | 1 }> = {};
  BANK.forEach((x, i) => { if (i % 3) return; h[x.k] = { n: 5, c: 2, last: 1 }; });
  const good: Record<string, string> = {}; const bad: Record<string, string> = {};
  BANK.forEach(x => { good[`${x.f}|${x.t}`] = '1111111110'; bad[`${x.f}|${x.t}`] = '0000011111'; });
  const pg = passEstimate(h, 1000, good), pb = passEstimate(h, 1000, bad);
  assert.ok(pg.ready && pb.ready && pg.prob > pb.prob);
}

console.log(`OK: ${BANK.length}問・${Object.keys(LESSON).length}論点・すべてのテストに合格`);
