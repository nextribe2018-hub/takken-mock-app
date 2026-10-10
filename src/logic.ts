// 出題・採点・習熟度のロジック（画面に依存しない純粋な関数）
import bankRaw from './data/bank.json';
import lessonsRaw from './data/lessons.json';

export type Field = '業法' | '権利' | '法令' | '税他';
export type Q = {
  f: Field; t: string; ref: string; s: string; a: 0 | 1; e: string; m: string;
  i: number; k: string;
};
export type SysTable = { title: string; head: string[]; rows: string[][] };
export type LessonSys = {
  overview: string;
  tree: { h: string; items: string[] }[];
  flow: { title: string; steps: string[] } | null;
  tables: SysTable[];
};
export type Lesson = { pts: string[]; traps: string[]; rel: string[]; bridge?: string; sys?: LessonSys };
export type HistItem = { n: number; c: number; last: 0 | 1 };
export type Hist = Record<string, HistItem>;
export type SetState = { round: number; scores: number[] };
export type LogItem = { at: string; round: number; score: number; sec: number; field?: Field };
// 論点ごとの直近10問の正誤（古い→新しい、'1'=正解）。キーは「分野|論点」
export type Recent = Record<string, string>;
export type Progress = { v: 2; hist: Hist; r10: Recent; set: SetState; log: LogItem[]; voice: boolean };

export const FIELDS: [Field, string][] = [
  ['業法', '宅建業法'], ['権利', '権利関係'], ['法令', '法令上の制限'], ['税他', '税・その他'],
];
export const fieldName = (f: Field) => FIELDS.find(x => x[0] === f)![1];

// 5回で本試験50問の比率（業法20・権利14・法令8・税他8）
export const MIX: Record<Field, number>[] = [
  { 業法: 4, 権利: 3, 法令: 2, 税他: 1 },
  { 業法: 4, 権利: 3, 法令: 2, 税他: 1 },
  { 業法: 4, 権利: 3, 法令: 2, 税他: 1 },
  { 業法: 4, 権利: 3, 法令: 1, 税他: 2 },
  { 業法: 4, 権利: 2, 法令: 1, 税他: 3 },
];
export const LIMIT = 600;

// 問題ごとの安定キー（分野|論点|出典、重複は #n）
export const BANK: Q[] = (() => {
  const seen: Record<string, number> = {};
  return (bankRaw as Omit<Q, 'i' | 'k'>[]).map((q, i) => {
    let k = `${q.f}|${q.t}|${q.ref}`;
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > 1) k += '#' + seen[k];
    return { ...q, i, k } as Q;
  });
})();
export const BYKEY: Record<string, Q> = Object.fromEntries(BANK.map(q => [q.k, q]));
export const LESSON = lessonsRaw as Record<string, Lesson>;

export const emptyProgress = (): Progress => ({ v: 2, hist: {}, r10: {}, set: { round: 0, scores: [] }, log: [], voice: false });

export function rec(hist: Hist, q: Q, ok: boolean): Hist {
  const h = hist[q.k] || { n: 0, c: 0, last: 0 };
  return { ...hist, [q.k]: { n: h.n + 1, c: h.c + (ok ? 1 : 0), last: ok ? 1 : 0 } };
}
export const topicKey = (q: { f: string; t: string }) => `${q.f}|${q.t}`;
// 1問の回答を記録（全体の記録＋論点ごとの直近10問）
export function record(p: Progress, q: Q, ok: boolean): Progress {
  const t = topicKey(q);
  return { ...p, hist: rec(p.hist, q, ok), r10: { ...p.r10, [t]: ((p.r10[t] || '') + (ok ? '1' : '0')).slice(-10) } };
}
// 順番の記録がない既存データ用：各問の最後の結果で論点の直近10問を補う（既にある論点はそのまま）
export function backfillRecent(hist: Hist, base: Recent = {}): Recent {
  const o: Recent = { ...base }; const tmp: Recent = {};
  BANK.forEach(q => { const h = hist[q.k]; if (h && h.n) { const t = topicKey(q); tmp[t] = (tmp[t] || '') + (h.last ? '1' : '0'); } });
  Object.keys(tmp).forEach(t => { if (!o[t]) o[t] = tmp[t].slice(-10); });
  return o;
}
const ones = (s: string) => (s.match(/1/g) || []).length;

// 優先度：未出題 → 前回不正解 → 解いた回数の少ない順
function prio(hist: Hist, q: Q) {
  const h = hist[q.k];
  if (!h) return 0;
  if (h.last === 0) return 1;
  return 2 + h.n;
}
export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
export function pick(hist: Hist, pool: Q[], n: number, exclude: Set<number>, rnd = Math.random): Q[] {
  const c = shuffle(pool.filter(q => !exclude.has(q.i)), rnd);
  c.sort((x, y) => prio(hist, x) - prio(hist, y));
  const out: Q[] = [];
  const used = new Set<string>();
  for (const q of c) { if (out.length >= n) break; if (!used.has(q.t)) { out.push(q); used.add(q.t); } }
  for (const q of c) { if (out.length >= n) break; if (!out.includes(q)) out.push(q); }
  return out;
}

export function buildExam(hist: Hist, round: number, rnd = Math.random): Q[] {
  const mix = MIX[round];
  const qs: Q[] = [];
  const ex = new Set<number>();
  FIELDS.forEach(([f]) => {
    pick(hist, BANK.filter(q => q.f === f), mix[f], ex, rnd).forEach(q => { qs.push(q); ex.add(q.i); });
  });
  return qs;
}

export function checkQuestions(hist: Hist, key: string, missed?: Q, rnd = Math.random): Q[] {
  const [f, t] = key.split('|');
  const pool = BANK.filter(q => q.f === f && q.t === t);
  const real = pool.filter(q => q.ref !== '確認');
  return pick(hist, real.length >= 3 ? real : pool, 3, new Set(missed ? [missed.i] : []), rnd);
}

export type TopicStat = { f: Field; t: string; total: number; n: number; c: number; recentWrong: number; rn: number; rc: number };
export function topicStats(hist: Hist, r10: Recent = backfillRecent(hist)): TopicStat[] {
  const m: Record<string, TopicStat> = {};
  BANK.forEach(q => {
    const k = q.f + '|' + q.t;
    const s = (m[k] = m[k] || { f: q.f, t: q.t, total: 0, n: 0, c: 0, recentWrong: 0, rn: (r10[k] || '').length, rc: ones(r10[k] || '') });
    s.total++;
    const h = hist[q.k];
    if (h) { s.n += h.n; s.c += h.c; if (h.last === 0) s.recentWrong++; }
  });
  return Object.values(m);
}
// 0=未着手 1=要復習 2=習得中 3=習得
export function topicState(s: TopicStat): 0 | 1 | 2 | 3 {
  if (!s.n) return 0;
  const r = s.c / s.n;
  if (s.recentWrong > 0 || r < 0.6) return 1;
  if (r < 0.8 || s.n < 5) return 2;
  return 3;
}

// 論点マップの色分け（表示専用）。直近10問の正答率で6段階、5問未満は「参考値」として薄く表示
export type Tier = 'none' | 'perfect' | 'good' | 'mid' | 'low' | 'bad';
export function topicTier(s: Pick<TopicStat, 'rn' | 'rc'>): { tier: Tier; few: boolean } {
  if (!s.rn) return { tier: 'none', few: false };
  const r = s.rc / s.rn;
  const tier: Tier = r >= 1 ? 'perfect' : r >= 0.8 ? 'good' : r >= 0.6 ? 'mid' : r >= 0.4 ? 'low' : 'bad';
  return { tier, few: s.rn < 5 };
}

export type Judge = { tone: 'ok' | 'mid' | 'ng'; label: string };
export const judge = (sc: number): Judge =>
  sc >= 8 ? { tone: 'ok', label: '合格圏' } : sc === 7 ? { tone: 'mid', label: '合格ライン上' } : { tone: 'ng', label: '要復習' };
export const judgeSet = (tot: number): Judge =>
  tot >= 37 ? { tone: 'ok', label: '安全圏' } : tot >= 35 ? { tone: 'mid', label: '合格ライン（7割）' } : { tone: 'ng', label: `あと${35 - tot}点で7割` };

export const jstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19);

// 試験を採点し、新しい進捗を返す
// 分野別10問テスト：その分野から10問（未出題・前回不正解を優先、論点を分散）
export function buildFieldExam(hist: Hist, f: Field, rnd = Math.random): Q[] {
  return pick(hist, BANK.filter(q => q.f === f), 10, new Set(), rnd);
}

// 分野別テストの採点（5回セットには入れない）
export function finishFieldExam(p: Progress, f: Field, qs: Q[], ans: (0 | 1 | null)[], used: number) {
  let cur = p;
  let score = 0;
  qs.forEach((q, k) => { const ok = ans[k] === q.a; if (ok) score++; cur = record(cur, q, ok); });
  const next: Progress = { ...cur, log: [...p.log, { at: jstNow(), round: 0, field: f, score, sec: used }].slice(-500) };
  return { next, score };
}

export function finishExam(p: Progress, qs: Q[], ans: (0 | 1 | null)[], used: number) {
  let cur = p;
  let score = 0;
  qs.forEach((q, k) => { const ok = ans[k] === q.a; if (ok) score++; cur = record(cur, q, ok); });
  const round = p.set.round;
  const scores = [...p.set.scores];
  scores[round] = score;
  const nextRound = (round + 1) % 5;
  const setDone = nextRound === 0;
  const next: Progress = {
    ...cur,
    set: { round: nextRound, scores: setDone ? [] : scores },
    log: [...p.log, { at: jstNow(), round: round + 1, score, sec: used }].slice(-500),
  };
  return { next, score, round, setScores: setDone ? scores : null };
}

export function wrongTopics(qs: Q[], ans: (0 | 1 | null)[]) {
  const out: { key: string; missed: { q: Q; your: 0 | 1 | null } }[] = [];
  const seen = new Set<string>();
  qs.forEach((q, k) => {
    if (ans[k] !== q.a) {
      const key = q.f + '|' + q.t;
      if (!seen.has(key)) { seen.add(key); out.push({ key, missed: { q, your: ans[k] } }); }
    }
  });
  return out;
}

export const speechText = (t: string) =>
  t.replace(/○/g, 'まる').replace(/×/g, 'ばつ').replace(/㎡/g, '平方メートル').replace(/％|%/g, 'パーセント');

// 間違えた問題と最も関係の深い体系図の枝・項目を、2文字組の重なりで推定する
const bigrams = (x: string) => {
  const s = x.replace(/[\s、。・：（）()「」，,．.0-9０-９]/g, '');
  const o = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2));
  return o;
};
const overlap = (a: Set<string>, b: Set<string>) => { let n = 0; b.forEach(x => { if (a.has(x)) n++; }); return n; };
export function relatedBranch(sys: LessonSys, q?: Q): { branch: number; item: number } {
  if (!q) return { branch: -1, item: -1 };
  const qb = bigrams(q.s + q.e);
  let branch = -1, best = 1;
  sys.tree.forEach((b, i) => { const sc = overlap(qb, bigrams(b.h + b.items.join(''))); if (sc > best) { best = sc; branch = i; } });
  let item = -1, bi = 0;
  if (branch >= 0) sys.tree[branch].items.forEach((it, j) => { const sc = overlap(qb, bigrams(it)); if (sc > bi) { bi = sc; item = j; } });
  return { branch, item };
}

// 間違えた問題に関係する表の行だけを抜き出す（最も関係の深い表から最大4行）
export function relatedRows(sys: LessonSys, q?: Q): { table: SysTable; rows: string[][] } | null {
  if (!q) return null;
  const qb = bigrams(q.s + q.e);
  let best: { table: SysTable; rows: string[][]; sc: number } | null = null;
  sys.tables.forEach(table => {
    const top = table.rows.map((r, i) => ({ r, i, sc: overlap(qb, bigrams(r.join(''))) }))
      .filter(o => o.sc >= 2).sort((a, b) => b.sc - a.sc).slice(0, 4).sort((a, b) => a.i - b.i);
    const sc = top.reduce((a, o) => a + o.sc, 0);
    if (top.length && (!best || sc > best.sc)) best = { table, rows: top.map(o => o.r), sc };
  });
  return best ? { table: (best as { table: SysTable }).table, rows: (best as { rows: string[][] }).rows } : null;
}

// 間違えた問題に関係するひっかけ（最大2件。見つからなければ先頭1件）
export function relatedTraps(lesson: Lesson, q?: Q): string[] {
  const traps = lesson.traps || [];
  if (!q) return traps.slice(0, 2);
  const qb = bigrams(q.s + q.e);
  const r = traps.map(x => ({ x, sc: overlap(qb, bigrams(x)) })).filter(o => o.sc >= 2)
    .sort((a, b) => b.sc - a.sc).slice(0, 2).map(o => o.x);
  return r.length ? r : traps.slice(0, 1);
}

/* ---------- 合格の見込み：○×の積み上げから本試験50問の得点を推定 ---------- */
export const PASS_LINES = [33, 34, 35, 36, 37]; // 例年の合格点は33〜37点。どの点になるかは同じ確率と仮定
export const EXAM_N: Record<Field, number> = { 業法: 20, 権利: 14, 法令: 8, 税他: 8 };
// ○×の正答率 p から4択1問の正答率を推計（消去法・2択への絞り込みを含む）
// 各肢の判断：S＝確信して正しく判定／U＝迷う（○×なら半々で当たる）／W＝確信して誤る。○×正答率 p = S + U/2
// k＝○×の誤りのうち「迷い」から来る割合（0＝誤りはすべて思い込み、1＝誤りはすべて迷い）
// 4択の解き方：「これが正解」と確信した肢の中から、なければ消せなかった（迷う）肢の中から、それもなければ4肢から選ぶ
export function toExam(p: number, k = 0.5): number {
  if (p < 1) k = Math.min(k, p / (1 - p)); // 迷いの割合は ○×正答率と両立する範囲に収める
  const u = 2 * (1 - p) * k, w = (1 - p) * (1 - k), s = Math.max(0, p - k * (1 - p));
  const pr = [s, u, w];
  let P = 0;
  for (let i = 0; i < 81; i++) {
    const st = [i % 3, Math.floor(i / 3) % 3, Math.floor(i / 9) % 3, Math.floor(i / 27) % 3]; // st[0]＝正解の肢
    let q = 1; for (const x of st) q *= pr[x];
    if (!q) continue;
    const flag: number[] = [], uns: number[] = [];
    st.forEach((x, j) => { if ((j === 0 && x === 0) || (j > 0 && x === 2)) flag.push(j); if (x === 1) uns.push(j); });
    const cand = flag.length ? flag : uns.length ? uns : [0, 1, 2, 3];
    if (cand.includes(0)) P += q / cand.length;
  }
  return P;
}
export const SCENARIOS = [
  { k: 0, label: '慎重（誤りはすべて思い込み）' },
  { k: 0.5, label: '標準（誤りの半分は迷い）' },
  { k: 1, label: '消去法が効く（誤りはすべて迷い）' },
];
export type FieldStat = { n: number; c: number; q: number; tot: number; rn: number; rc: number };
export function fieldStats(hist: Hist, r10: Recent = backfillRecent(hist)): Record<Field, FieldStat> {
  const o = {} as Record<Field, FieldStat>;
  FIELDS.forEach(([f]) => { o[f] = { n: 0, c: 0, q: 0, tot: 0, rn: 0, rc: 0 }; });
  BANK.forEach(q => { const s = o[q.f]; s.tot++; const h = hist[q.k]; if (h) { s.n += h.n; s.c += h.c; s.q++; } });
  // 直近：論点ごとの直近10問を分野でまとめる
  Object.entries(r10).forEach(([t, r]) => { const f = t.split('|')[0] as Field; if (o[f]) { o[f].rn += r.length; o[f].rc += ones(r); } });
  return o;
}
// ---- 過去問の4択に戻す：同じ「年度-問番号」の肢をまとめ、肢ごとの正答率から元の4択1問の正解率を推計 ----
// 1肢ごとの判断が当たる確率 p[i] から、4択で正解できる確率（ans＝正解の肢の位置）。toExam と同じ「確信／迷う／誤信」モデル
export function fourFromLimbs(ps: number[], ans: number, k = 0.5): number {
  const pr = ps.map(p => { const kk = p < 1 ? Math.min(k, p / (1 - p)) : k; return [Math.max(0, p - kk * (1 - p)), 2 * (1 - p) * kk, (1 - p) * (1 - kk)]; });
  let P = 0;
  for (let i = 0; i < 81; i++) {
    const st = [i % 3, Math.floor(i / 3) % 3, Math.floor(i / 9) % 3, Math.floor(i / 27) % 3];
    let q = 1; st.forEach((x, j) => { q *= pr[j][x]; });
    if (!q) continue;
    const flag: number[] = [], uns: number[] = [];
    st.forEach((x, j) => { if ((j === ans && x === 0) || (j !== ans && x === 2)) flag.push(j); if (x === 1) uns.push(j); });
    const cand = flag.length ? flag : uns.length ? uns : [0, 1, 2, 3];
    if (cand.includes(ans)) P += q / cand.length;
  }
  return P;
}
export type FourLimb = { q: Q; label: string; n: number; c: number; p: number };
export type FourItem = {
  id: string; label: string; f: Field; topics: string[]; limbs: FourLimb[];
  answered: number; missing: number; kind: 'single' | 'count'; prob: number;
};
export type FourSummary = { items: FourItem[]; n: number; avg: number; nSolid: number; avgSolid: number | null; total: number };
export const refLabelJa = (id: string) => {
  const m = id.match(/^([RH])(\d+)(s?)-(\d+)$/);
  if (!m) return id;
  return `${m[1] === 'R' ? '令和' : '平成'}${+m[2] === 1 && m[1] === 'R' ? '元' : +m[2]}年${m[3] ? '12月' : ''} 問${+m[4]}`;
};
export const FOUR_GROUPS: Record<string, Q[]> = (() => {
  const g: Record<string, Q[]> = {};
  BANK.forEach(q => { const m = q.ref.match(/^(.+)-([^-]+)$/); if (!m || q.ref === '確認') return; (g[m[1]] = g[m[1]] || []).push(q); });
  return g;
})();
export function fourChoice(hist: Hist, r10: Recent = backfillRecent(hist), k = 0.5): FourSummary {
  const ts = topicStats(hist, r10);
  const fs = fieldStats(hist, r10);
  let tn = 0, tc = 0; Object.values(hist).forEach(h => { tn += h.n; tc += h.c; });
  const all = tn ? tc / tn : 0.7;
  // 論点の実力：直近10問の正答率を、分野の正答率5問分でならす（数問だけで0%・100%と決めつけない）。分野も全体に5問分でならす
  const PRIOR = 5;
  const fieldRate = (f: Field) => { const F = fs[f]; return F.rn ? (F.rc + PRIOR * all) / (F.rn + PRIOR) : F.n ? (F.c + PRIOR * all) / (F.n + PRIOR) : all; };
  const rate = (f: Field, t: string) => {
    const s = ts.find(x => x.f === f && x.t === t); const fr = fieldRate(f);
    if (s && s.rn) return (s.rc + PRIOR * fr) / (s.rn + PRIOR);
    if (s && s.n) return (s.c + PRIOR * fr) / (s.n + PRIOR);
    return fr;
  };
  const clamp = (x: number) => Math.min(0.99, Math.max(0.01, x));
  const items: FourItem[] = [];
  Object.entries(FOUR_GROUPS).forEach(([id, qs]) => {
    const answered = qs.filter(q => hist[q.k]).length;
    if (!answered) return;
    const limbs: FourLimb[] = qs.map(q => {
      const h = hist[q.k]; const pt = rate(q.f, q.t);
      // 解いた肢はその肢の成績を論点の実力で1回分ならす（1回正解だけで100%としない）
      return { q, label: q.ref.split('-').pop()!, n: h ? h.n : 0, c: h ? h.c : 0, p: clamp(h ? (h.c + pt) / (h.n + 1) : pt) };
    });
    const missing = Math.max(0, 4 - limbs.length);
    const fill = limbs.reduce((a, l) => a + rate(l.q.f, l.q.t), 0) / limbs.length;
    const ps = [...limbs.map(l => l.p), ...Array(missing).fill(clamp(fill))];
    const kind: FourItem['kind'] = limbs.some(l => /[アイウエ]/.test(l.label)) ? 'count' : 'single';
    // 個数・組合せ問題は4肢すべての判断が要る（積で近似・やや厳しめ）。通常の4択は正解肢の位置で平均
    const prob = kind === 'count' ? ps.reduce((a, b) => a * b, 1) : [0, 1, 2, 3].reduce((a, j) => a + fourFromLimbs(ps, j, k), 0) / 4;
    items.push({ id, label: refLabelJa(id), f: qs[0].f, topics: [...new Set(qs.map(q => q.t))], limbs, answered, missing, kind, prob });
  });
  items.sort((a, b) => a.prob - b.prob);
  const solid = items.filter(x => x.answered >= 3);
  const avg = items.length ? items.reduce((a, x) => a + x.prob, 0) / items.length : 0;
  return { items, n: items.length, avg, nSolid: solid.length, avgSolid: solid.length ? solid.reduce((a, x) => a + x.prob, 0) / solid.length : null, total: Object.keys(FOUR_GROUPS).length };
}

function seeded(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gammaS(k: number, r: () => number): number {
  if (k < 1) return gammaS(k + 1, r) * Math.pow(r() || 1e-12, 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { const u1 = r() || 1e-12, u2 = r(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = r();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u || 1e-12) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
type SimResult = { k: number; byLine: number[]; prob: number; mean: number; lo: number; hi: number; exp: Record<Field, number>; four: number };
export type Scenario = SimResult & { label: string };
export type PassEstimate =
  | { ready: false; total: number; st: Record<Field, FieldStat> }
  | ({ ready: true; total: number; st: Record<Field, FieldStat>; ox: number; oxAll: number; rn: number; scen: Scenario[]; focus: Field } & SimResult);
// 分野ごとの正答率の不確かさ（ベータ分布）も含めて本試験50問をシミュレーション
function simulate(st: Record<Field, { n: number; c: number }>, k: number, sims: number): SimResult {
  const r = seeded(20261008);
  const sc: number[] = [];
  for (let i = 0; i < sims; i++) {
    let x = 0;
    FIELDS.forEach(([f]) => {
      const s = st[f]; const a = gammaS(s.c + 1, r), b = gammaS(s.n - s.c + 1, r); const p = toExam(a / (a + b), k);
      for (let j = 0; j < EXAM_N[f]; j++) if (r() < p) x++;
    });
    sc.push(x);
  }
  sc.sort((a, b) => a - b);
  const byLine = PASS_LINES.map(t => sc.filter(x => x >= t).length / sims);
  const exp = {} as Record<Field, number>;
  FIELDS.forEach(([f]) => { const s = st[f]; exp[f] = EXAM_N[f] * toExam((s.c + 1) / (s.n + 2), k); });
  return {
    k, byLine, prob: byLine.reduce((a, b) => a + b, 0) / byLine.length,
    mean: sc.reduce((a, b) => a + b, 0) / sims, lo: sc[Math.floor(sims * 0.1)], hi: sc[Math.floor(sims * 0.9)],
    exp, four: FIELDS.reduce((a, [f]) => a + exp[f], 0) / 50,
  };
}
// 見出しは「標準」（誤りの半分は迷い）。慎重・消去法が効く場合も併せて返す
// 合格確率は直近の正答率（論点ごとの直近10問を分野で合算）で計算。直近がない分野は全体を使う
export function passEstimate(hist: Hist, sims = 3000, r10: Recent = backfillRecent(hist)): PassEstimate {
  const st = fieldStats(hist, r10);
  const total = Object.values(st).reduce((a, s) => a + s.n, 0);
  if (total < 30) return { ready: false, total, st };
  const rs = {} as Record<Field, { n: number; c: number }>;
  FIELDS.forEach(([f]) => { const s = st[f]; rs[f] = s.rn ? { n: s.rn, c: s.rc } : { n: s.n, c: s.c }; });
  const scen = SCENARIOS.map(x => ({ ...simulate(rs, x.k, sims), label: x.label }));
  const M = scen[1];
  const rn = Object.values(rs).reduce((a, s) => a + s.n, 0);
  const ox = Object.values(rs).reduce((a, s) => a + s.c, 0) / rn;
  const oxAll = Object.values(st).reduce((a, s) => a + s.c, 0) / total;
  const focus = FIELDS.map(([f]) => f).sort((a, b) => (EXAM_N[b] - M.exp[b]) - (EXAM_N[a] - M.exp[a]))[0];
  return { ready: true, total, st, ox, oxAll, rn, scen, focus, ...M };
}
