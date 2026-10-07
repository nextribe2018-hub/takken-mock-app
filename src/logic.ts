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
export type LogItem = { at: string; round: number; score: number; sec: number };
export type Progress = { v: 2; hist: Hist; set: SetState; log: LogItem[]; voice: boolean };

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

export const emptyProgress = (): Progress => ({ v: 2, hist: {}, set: { round: 0, scores: [] }, log: [], voice: false });

export function rec(hist: Hist, q: Q, ok: boolean): Hist {
  const h = hist[q.k] || { n: 0, c: 0, last: 0 };
  return { ...hist, [q.k]: { n: h.n + 1, c: h.c + (ok ? 1 : 0), last: ok ? 1 : 0 } };
}

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

export type TopicStat = { f: Field; t: string; total: number; n: number; c: number; recentWrong: number };
export function topicStats(hist: Hist): TopicStat[] {
  const m: Record<string, TopicStat> = {};
  BANK.forEach(q => {
    const k = q.f + '|' + q.t;
    const s = (m[k] = m[k] || { f: q.f, t: q.t, total: 0, n: 0, c: 0, recentWrong: 0 });
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

export type Judge = { tone: 'ok' | 'mid' | 'ng'; label: string };
export const judge = (sc: number): Judge =>
  sc >= 8 ? { tone: 'ok', label: '合格圏' } : sc === 7 ? { tone: 'mid', label: '合格ライン上' } : { tone: 'ng', label: '要復習' };
export const judgeSet = (tot: number): Judge =>
  tot >= 37 ? { tone: 'ok', label: '安全圏' } : tot >= 35 ? { tone: 'mid', label: '合格ライン（7割）' } : { tone: 'ng', label: `あと${35 - tot}点で7割` };

export const jstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19);

// 試験を採点し、新しい進捗を返す
export function finishExam(p: Progress, qs: Q[], ans: (0 | 1 | null)[], used: number) {
  let hist = p.hist;
  let score = 0;
  qs.forEach((q, k) => { const ok = ans[k] === q.a; if (ok) score++; hist = rec(hist, q, ok); });
  const round = p.set.round;
  const scores = [...p.set.scores];
  scores[round] = score;
  const nextRound = (round + 1) % 5;
  const setDone = nextRound === 0;
  const next: Progress = {
    ...p, hist,
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
