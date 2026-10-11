// ロジックの簡易テスト: npx tsx scripts/test-logic.ts
import assert from 'node:assert/strict';
import {
  BANK, FIELDS, LESSON, MIX, buildExam, buildFieldExam, finishFieldExam, passEstimate, record, backfillRecent, relatedBranch, topicTier, toExam, fourChoice, fourFromLimbs, FOUR_GROUPS, refLabelJa, relatedRows, relatedTraps, checkQuestions, emptyProgress, finishExam, topicStats, wrongTopics,
  buildRound, choiceOrder, fieldStatsBy, freeExam, finishRound, quotas, reviewQuestions, statsBy, wrongGroups,
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
  const fst = fieldStatsBy(x, out.next.hist);
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

// ---- 宅建（過去問・体系解説・分野別テスト・合格の見込み） ----
// 13) 全論点に体系解説（全体像・表）があり、表の列数がそろっている
Object.entries(LESSON).forEach(([k, L]) => {
  assert.ok(L.sys, `体系解説なし: ${k}`);
  assert.ok(L.sys!.tree.length >= 3 && L.sys!.tables.length >= 1, `体系解説が薄い: ${k}`);
  L.sys!.tables.forEach(t => t.rows.forEach(r => assert.equal(r.length, t.head.length, `${k} ${t.title}`)));
});
// 14) 間違えた問題に関係する枝が見つかる（全問題で枝番号が範囲内）
let found = 0;
BANK.forEach(q => { const s = LESSON[`${q.f}|${q.t}`].sys!; const h = relatedBranch(s, q); assert.ok(h.branch < s.tree.length); if (h.branch >= 0) found++; });
console.log(`体系図の該当枝が見つかった問題: ${found} / ${BANK.length}`);

// 15) 絞り込み解説：表の抜粋は最大4行で元の表の行に含まれる、ひっかけは最大2件
let withRows = 0;
BANK.forEach(q => {
  const L = LESSON[`${q.f}|${q.t}`];
  const r = relatedRows(L.sys!, q);
  if (r) { withRows++; assert.ok(r.rows.length >= 1 && r.rows.length <= 4); r.rows.forEach(row => assert.ok(r.table.rows.includes(row))); }
  const tr = relatedTraps(L, q); assert.ok(tr.length <= 2); tr.forEach(x => assert.ok(L.traps.includes(x)));
});
console.log(`関係する表の行が見つかった問題: ${withRows} / ${BANK.length}`);

// 16) 分野別10問：その分野だけ・10問・重複なし。採点しても5回セットは動かない
FIELDS.forEach(([f]) => {
  const qs = buildFieldExam({}, f);
  assert.equal(qs.length, 10); assert.ok(qs.every(q => q.f === f)); assert.equal(new Set(qs.map(q => q.k)).size, 10);
  const pr = emptyProgress(); const r = finishFieldExam(pr, f, qs, qs.map(q => q.a), 120);
  assert.equal(r.score, 10); assert.deepEqual(r.next.set, pr.set); assert.equal(r.next.log.at(-1)!.field, f);
});
// 17) 合格の見込み：30問未満は判定しない、正答率が高いほど確率・予想点が上がる
assert.equal(passEstimate({}).ready, false);
const sim = (rate: number) => { const h: Record<string, { n: number; c: number; last: 0 | 1 }> = {};
  BANK.forEach((q, i) => { if (i % 3) return; const ok = ((i * 7919) % 100) / 100 < rate; h[q.k] = { n: 1, c: ok ? 1 : 0, last: ok ? 1 : 0 }; }); return passEstimate(h); };
const lo = sim(0.6), mid = sim(0.8), hi = sim(0.92);
assert.ok(lo.ready && mid.ready && hi.ready);
if (lo.ready && mid.ready && hi.ready) {
  assert.ok(lo.prob <= mid.prob && mid.prob <= hi.prob && lo.mean < mid.mean && mid.mean < hi.mean);
  console.log(`合格の見込み 正答率60%→${Math.round(lo.prob * 100)}%（${lo.mean.toFixed(1)}点） 80%→${Math.round(mid.prob * 100)}%（${mid.mean.toFixed(1)}点） 92%→${Math.round(hi.prob * 100)}%（${hi.mean.toFixed(1)}点）`);
}

// 18) ○×→4択の換算（消去法込み）：全問正解なら1。○×80%→慎重62%・標準71%・消去法82%。p・k に対して単調増加
assert.ok(Math.abs(toExam(1) - 1) < 1e-9);
assert.ok(Math.abs(toExam(0.8, 0) - 0.616) < 0.002 && Math.abs(toExam(0.85, 0) - 0.700) < 0.002);
assert.ok(Math.abs(toExam(0.8, 0.5) - 0.714) < 0.002 && Math.abs(toExam(0.8, 1) - 0.818) < 0.002);
for (let p = 0.3; p < 0.95; p += 0.05) for (const k of [0, 0.5, 1]) assert.ok(toExam(p + 0.05, k) > toExam(p, k));
for (const p of [0.6, 0.7, 0.8, 0.9]) assert.ok(toExam(p, 0) < toExam(p, 0.5) && toExam(p, 0.5) < toExam(p, 1));

// 19) 論点ごとの直近10問：記録は最大10件・新しいものが末尾。合格確率は直近で計算
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

// 20) 論点マップの色：直近10問の正答率で6段階、5問未満は参考値
{
  const t = (rc: number, rn: number) => topicTier({ rc, rn });
  assert.deepEqual(t(0, 0), { tier: 'none', few: false });
  assert.deepEqual(t(10, 10), { tier: 'perfect', few: false });
  assert.deepEqual(t(8, 10), { tier: 'good', few: false });
  assert.deepEqual(t(7, 10), { tier: 'mid', few: false });
  assert.deepEqual(t(4, 10), { tier: 'low', few: false });
  assert.deepEqual(t(3, 10), { tier: 'bad', few: false });
  assert.deepEqual(t(4, 4), { tier: 'perfect', few: true });
  assert.deepEqual(t(4, 5), { tier: 'good', few: false });
}

// 21) 4択に戻す：同じp なら toExam と一致、肢の成績が上がれば4択の正解率も上がる
{
  for (const p of [0.6, 0.8, 0.9]) for (let j = 0; j < 4; j++) assert.ok(Math.abs(fourFromLimbs([p, p, p, p], j) - toExam(p)) < 1e-9);
  assert.ok(fourFromLimbs([0.95, 0.6, 0.6, 0.6], 0) > fourFromLimbs([0.6, 0.6, 0.6, 0.6], 0));
  assert.equal(refLabelJa('R03s-29'), '令和3年12月 問29'); assert.equal(refLabelJa('R01-43'), '令和元年 問43'); assert.equal(refLabelJa('H28-35'), '平成28年 問35');
  assert.ok(Object.keys(FOUR_GROUPS).length > 500 && Object.values(FOUR_GROUPS).every(g => g.length <= 4));
  assert.equal(fourChoice({}).n, 0);
  const id = Object.keys(FOUR_GROUPS).find(k => FOUR_GROUPS[k].length === 3 && !/[アイウエ]/.test(FOUR_GROUPS[k][0].ref))!;
  const g = FOUR_GROUPS[id];
  const mk = (ok: boolean) => Object.fromEntries(g.map(q => [q.k, { n: 2, c: ok ? 2 : 0, last: (ok ? 1 : 0) as 0 | 1 }]));
  const good = fourChoice(mk(true)), bad = fourChoice(mk(false));
  assert.equal(good.n, 1); assert.equal(good.items[0].missing, 1); assert.equal(good.nSolid, 1);
  assert.ok(good.items[0].prob > bad.items[0].prob);
  console.log(`4択に戻す ${id}: 全肢正解→${Math.round(good.items[0].prob * 100)}% 全肢不正解→${Math.round(bad.items[0].prob * 100)}%（元の4択 ${Object.keys(FOUR_GROUPS).length}問）`);
}

console.log(`OK: ${BANK.length}問・${Object.keys(LESSON).length}論点・すべてのテストに合格`);
console.log(`OK: 試験パック ${summary.join('・')}`);
if (freeShort.length) console.log(`注意: 無料版が1回分（10問）に満たない試験 ${freeShort.join('・')}`);
