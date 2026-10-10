// 出題・採点・習熟度のロジック（画面に依存しない純粋な関数）
// 試験ごとの違いは src/exams.ts の Exam に持たせ、ここの関数は Exam を受け取る。
// 末尾の「宅建用」は、画面（App.tsx）が使っている従来の関数名を残したもの。
import lessonsRaw from './data/lessons.json';
import { EXAM, Exam, Item } from './exams';

export type Field = '業法' | '権利' | '法令' | '税他';
export type Q = Item & { f: Field; a: 0 | 1 };
export type Lesson = { pts: string[]; traps: string[]; rel: string[]; bridge?: string };
export type HistItem = { n: number; c: number; last: 0 | 1 };
export type Hist = Record<string, HistItem>;
export type SetState = { round: number; scores: number[] };
export type LogItem = { at: string; round: number; score: number; sec: number };
export type Progress = { v: 2; hist: Hist; set: SetState; log: LogItem[]; voice: boolean };

export const LESSON = lessonsRaw as Record<string, Lesson>;

export const emptyProgress = (): Progress => ({ v: 2, hist: {}, set: { round: 0, scores: [] }, log: [], voice: false });

export function rec(hist: Hist, q: Item, ok: boolean): Hist {
  const h = hist[q.k] || { n: 0, c: 0, last: 0 };
  return { ...hist, [q.k]: { n: h.n + 1, c: h.c + (ok ? 1 : 0), last: ok ? 1 : 0 } };
}

// 優先度：未出題 → 前回不正解 → 解いた回数の少ない順
function prio(hist: Hist, q: Item) {
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
export function pick<T extends Item>(hist: Hist, pool: T[], n: number, exclude: Set<number>, rnd = Math.random): T[] {
  const c = shuffle(pool.filter(q => !exclude.has(q.i)), rnd);
  c.sort((x, y) => prio(hist, x) - prio(hist, y));
  const out: T[] = [];
  const used = new Set<string>();
  for (const q of c) { if (out.length >= n) break; if (!used.has(q.t)) { out.push(q); used.add(q.t); } }
  for (const q of c) { if (out.length >= n) break; if (!out.includes(q)) out.push(q); }
  return out;
}

// 分野ごとの出題数：rounds があればその回の内訳、なければ問題数に比例（端数は大きい順に配る）
export function quotas(x: Exam, round: number): Record<string, number> {
  if (x.rounds) return x.rounds[round % x.rounds.length];
  const n = Math.min(x.size, x.items.length);
  const raw = x.fields.map(([f]) => (x.items.filter(q => q.f === f).length * n) / x.items.length);
  const base = raw.map(Math.floor);
  const ord = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  const rest = n - base.reduce((a, b) => a + b, 0);
  for (let k = 0; k < rest; k++) base[ord[k % ord.length][1]]++;
  return Object.fromEntries(x.fields.map(([f], i) => [f, base[i]]));
}

// 1回分を組む。rounds のある試験（宅建）は分野順、ない試験は混ぜて出す
export function buildRound(x: Exam, hist: Hist, round: number, rnd = Math.random): Item[] {
  const mix = quotas(x, round);
  const qs: Item[] = [];
  const ex = new Set<number>();
  x.fields.forEach(([f]) => {
    pick(hist, x.items.filter(q => q.f === f), mix[f] || 0, ex, rnd).forEach(q => { qs.push(q); ex.add(q.i); });
  });
  const n = Math.min(x.size, x.items.length);
  if (qs.length < n) pick(hist, x.items, n - qs.length, ex, rnd).forEach(q => qs.push(q));
  return x.rounds ? qs : shuffle(qs, rnd);
}

// 4択の表示順（c の番号の並び）。fix のときは最後の選択肢を末尾に固定
export function choiceOrder(q: Item, rnd = Math.random): number[] {
  const idx = (q.c || []).map((_, i) => i);
  if (!q.fix) return shuffle(idx, rnd);
  return [...shuffle(idx.slice(0, -1), rnd), idx[idx.length - 1]];
}

export function reviewQuestions<T extends Item>(x: Exam, hist: Hist, key: string, missed?: T, rnd = Math.random): T[] {
  const [f, t] = key.split('|');
  const pool = (x.items as T[]).filter(q => q.f === f && (x.reviewBy === 'field' || q.t === t));
  const real = pool.filter(q => q.ref !== '確認');
  return pick(hist, real.length >= 3 ? real : pool, 3, new Set(missed ? [missed.i] : []), rnd);
}

export type TopicStat = { f: string; t: string; total: number; n: number; c: number; recentWrong: number };
export function statsBy(x: Exam, hist: Hist): TopicStat[] {
  const m: Record<string, TopicStat> = {};
  x.items.forEach(q => {
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

// 試験を採点し、新しい進捗を返す。ans は ox なら 1/0、choice なら c の番号
export function finishRound(x: Exam, p: Progress, qs: Item[], ans: (number | null)[], used: number) {
  let hist = p.hist;
  let score = 0;
  qs.forEach((q, k) => { const ok = ans[k] === q.a; if (ok) score++; hist = rec(hist, q, ok); });
  const R = x.rounds?.length || 1;
  const round = p.set.round % R;
  const scores = [...p.set.scores];
  scores[round] = score;
  const nextRound = (round + 1) % R;
  const setDone = !!x.rounds && nextRound === 0;
  const next: Progress = {
    ...p, hist,
    set: { round: nextRound, scores: setDone ? [] : scores },
    log: [...p.log, { at: jstNow(), round: round + 1, score, sec: used }].slice(-500),
  };
  return { next, score, round, setScores: setDone ? scores : null };
}

// 間違えたまとまり（宅建＝論点、歴史＝分野）ごとに最初の1問を返す
export function wrongGroups<T extends Item, A extends number | null>(x: Exam, qs: T[], ans: A[]) {
  const out: { key: string; missed: { q: T; your: A } }[] = [];
  const seen = new Set<string>();
  qs.forEach((q, k) => {
    if (ans[k] !== q.a) {
      const key = q.f + '|' + (x.reviewBy === 'topic' ? q.t : '');
      if (!seen.has(key)) { seen.add(key); out.push({ key, missed: { q, your: ans[k] } }); }
    }
  });
  return out;
}

export const speechText = (t: string) =>
  t.replace(/○/g, 'まる').replace(/×/g, 'ばつ').replace(/㎡/g, '平方メートル').replace(/％|%/g, 'パーセント');

// ---- 宅建用（App.tsx の従来の呼び方） ----
export const TAKKEN = EXAM.takken;
export const BANK = TAKKEN.items as Q[];
export const FIELDS = TAKKEN.fields as [Field, string][];
export const fieldName = (f: Field) => FIELDS.find(x => x[0] === f)![1];
export const MIX = TAKKEN.rounds as Record<Field, number>[];
export const LIMIT = TAKKEN.limit;
export const BYKEY: Record<string, Q> = Object.fromEntries(BANK.map(q => [q.k, q]));
export const buildExam = (hist: Hist, round: number, rnd = Math.random) => buildRound(TAKKEN, hist, round, rnd) as Q[];
export const checkQuestions = (hist: Hist, key: string, missed?: Q, rnd = Math.random) => reviewQuestions(TAKKEN, hist, key, missed, rnd);
export const topicStats = (hist: Hist) => statsBy(TAKKEN, hist) as (TopicStat & { f: Field })[];
export const finishExam = (p: Progress, qs: Q[], ans: (0 | 1 | null)[], used: number) => finishRound(TAKKEN, p, qs, ans, used);
export const wrongTopics = (qs: Q[], ans: (0 | 1 | null)[]) => wrongGroups(TAKKEN, qs, ans);
