// 出題・採点・習熟度のロジック（画面に依存しない純粋な関数）
// 試験ごとの違いは src/exams.ts の Exam に持たせ、ここの関数は Exam を受け取る。
// 末尾の「宅建用」は、画面（App.tsx）が使っている従来の関数名を残したもの。
import lessonsRaw from './data/lessons.json';
import { EXAM, Exam, Item } from './exams';

export type Field = '業法' | '権利' | '法令' | '税他';
// 宅建の問題（exams.ts の Item を分野と○×の正解に絞った形。安定キー k は 分野|論点|出典、重複は #n）
export type Q = Item & { f: Field; a: 0 | 1 };
export type SysTable = { title: string; head: string[]; rows: string[][] };
export type LessonSys = {
  overview: string;
  tree: { h: string; items: string[] }[];
  flow: { title: string; steps: string[] } | null;
  tables: SysTable[];
};
// 具体例（t 見出し・s 場面・p 結論と理由・kw 問題文との照合用キーワード）と周辺知識
export type LessonEx = { t: string; s: string; p: string; kw: string[] };
export type LessonAround = { h: string; b: string };
// 判例（n 裁判所・年月日、f 事案、h 判旨・結論、pt 試験でのポイント、kw 照合用キーワード）。民法・借地借家の論点
export type LessonCase = { n: string; f: string; h: string; pt: string; kw: string[] };
export type Lesson = { pts: string[]; traps: string[]; rel: string[]; bridge?: string; sys?: LessonSys; ex?: LessonEx[]; around?: LessonAround[]; cases?: LessonCase[] };
// キーワードが問題文・解説に多く含まれる順に並べる（同点は元の順＝重要度順）。near＝問題に関係する（1語以上一致）
export function orderByKw<T extends { kw: string[] }>(list: T[], q?: { s: string; e: string }): { item: T; near: boolean }[] {
  if (!q) return list.map(x => ({ item: x, near: false }));
  const text = q.s + q.e;
  const sc = list.map((x, i) => ({ x, i, n: x.kw.filter(k => text.includes(k)).length }));
  sc.sort((a, b) => b.n - a.n || a.i - b.i);
  return sc.map(o => ({ item: o.x, near: o.n > 0 }));
}
// 間違えた問題に近い具体例を先頭に（キーワードが問題文・解説に多く含まれる順）。near は先頭が問題に関係するとき true
export function orderExamples(L: Lesson, q?: { s: string; e: string }): { ex: LessonEx; near: boolean }[] {
  const ex = L.ex || [];
  if (!q) return ex.map(x => ({ ex: x, near: false }));
  const text = q.s + q.e;
  const sc = ex.map((x, i) => ({ x, i, n: x.kw.filter(k => text.includes(k)).length }));
  sc.sort((a, b) => b.n - a.n || a.i - b.i);
  return sc.map((o, j) => ({ ex: o.x, near: j === 0 && o.n > 0 }));
}
export type HistItem = { n: number; c: number; last: 0 | 1 };
export type Hist = Record<string, HistItem>;
// topics＝このセット（5回）で出した論点（「分野|論点」）、carry＝前のセットで出し切れなかった論点（次のセットで優先）
export type SetState = { round: number; scores: number[]; topics?: string[]; carry?: string[] };
export type LogItem = { at: string; round: number; score: number; sec: number; field?: Field };
// 論点ごとの直近10問の正誤（古い→新しい、'1'=正解）。キーは「分野|論点」
export type Recent = Record<string, string>;
export type Progress = { v: 2; hist: Hist; r10: Recent; set: SetState; log: LogItem[]; voice: boolean };

export const LESSON = lessonsRaw as Record<string, Lesson>;

export const emptyProgress = (): Progress => ({ v: 2, hist: {}, r10: {}, set: { round: 0, scores: [] }, log: [], voice: false });

export function rec(hist: Hist, q: Item, ok: boolean): Hist {
  const h = hist[q.k] || { n: 0, c: 0, last: 0 };
  return { ...hist, [q.k]: { n: h.n + 1, c: h.c + (ok ? 1 : 0), last: ok ? 1 : 0 } };
}
export const topicKey = (q: { f: string; t: string }) => `${q.f}|${q.t}`;
// 1問の回答を記録（全体の記録＋論点ごとの直近10問）
export function record(p: Progress, q: Item, ok: boolean): Progress {
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

// 論点を一巡させる選び方：前セットの持ち越し論点 → このセットでまだ出していない論点 → 出した論点 の順。
// 同じ順位の中は従来どおり（未出題 → 前回不正解 → 回答の少ない問題）。1回の中では論点が重ならないようにする
export function pickCover<T extends Item>(hist: Hist, pool: T[], n: number, exclude: Set<number>, set: SetState, rnd = Math.random): T[] {
  const used = new Set(set.topics || []), carry = new Set(set.carry || []);
  const rank = (q: T) => { const k = q.f + '|' + q.t; return carry.has(k) && !used.has(k) ? 0 : used.has(k) ? 2 : 1; };
  const c = shuffle(pool.filter(q => !exclude.has(q.i)), rnd);
  c.sort((a, b) => rank(a) - rank(b) || prio(hist, a) - prio(hist, b));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const q of c) { if (out.length >= n) break; if (!seen.has(q.t)) { out.push(q); seen.add(q.t); } }
  for (const q of c) { if (out.length >= n) break; if (!out.includes(q)) out.push(q); }
  return out;
}
// 1回分を組む。rounds のある試験（宅建）は分野順で、5回のセットで論点が一巡するように選ぶ。ない試験は混ぜて出す
export function buildRound(x: Exam, hist: Hist, round: number, rnd = Math.random, set?: SetState): Item[] {
  const mix = quotas(x, round);
  const qs: Item[] = [];
  const ex = new Set<number>();
  x.fields.forEach(([f]) => {
    const pool = x.items.filter(q => q.f === f), n = mix[f] || 0;
    (x.rounds && set ? pickCover(hist, pool, n, ex, set, rnd) : pick(hist, pool, n, ex, rnd)).forEach(q => { qs.push(q); ex.add(q.i); });
  });
  const n = Math.min(x.size, x.items.length);
  if (qs.length < n) pick(hist, x.items, n - qs.length, ex, rnd).forEach(q => qs.push(q));
  return x.rounds ? qs : shuffle(qs, rnd);
}

// 無料版の範囲：分野ごとに 10問に1問（分野内の並びで 0, 10, 20…番目。端数は切り上げ）。
// 安定キーの並びで決めるので、アプリを更新しても無料の問題は変わらない
const freeCache = new Map<string, Exam>();
export function freeExam(x: Exam): Exam {
  let e = freeCache.get(x.id);
  if (!e) {
    const seen: Record<string, number> = {};
    const items = x.items.filter(q => (seen[q.f] = (seen[q.f] ?? -1) + 1) % 10 === 0);
    e = { ...x, items };
    freeCache.set(x.id, e);
  }
  return e;
}

// 4択の表示順（c の番号の並び）。fix のときは最後の選択肢を末尾に固定
export function choiceOrder(q: Item, rnd = Math.random): number[] {
  const idx = (q.c || []).map((_, i) => i);
  if (!q.fix) return shuffle(idx, rnd);
  return [...shuffle(idx.slice(0, -1), rnd), idx[idx.length - 1]];
}

// 確認例題の問題数：論点ごとに復習する試験（宅建）は5問、分野ごとの試験は3問
export const reviewCount = (x: Exam) => (x.reviewBy === 'topic' ? 5 : 3);
// 確認例題の判定：習得＝8割以上（5問なら4問）、もう一息＝6割以上
export const reviewJudge = (right: number, n: number): Judge =>
  right >= Math.ceil(n * 0.8) ? { tone: 'ok', label: '習得' } : right >= Math.ceil(n * 0.6) ? { tone: 'mid', label: 'もう一息' } : { tone: 'ng', label: '要復習' };
export function reviewQuestions<T extends Item>(x: Exam, hist: Hist, key: string, missed?: T, rnd = Math.random): T[] {
  const [f, t] = key.split('|');
  const n = reviewCount(x);
  const pool = (x.items as T[]).filter(q => q.f === f && (x.reviewBy === 'field' || q.t === t));
  const real = pool.filter(q => q.ref !== '確認');
  return pick(hist, real.length >= n ? real : pool, n, new Set(missed ? [missed.i] : []), rnd);
}

// 論点ごとの成績。rn/rc は論点の直近10問（r10）の回答数・正解数。f は宅建では Field、他の試験では分野名
export type TopicStat<F extends string = Field> = { f: F; t: string; total: number; n: number; c: number; recentWrong: number; rn: number; rc: number };
export function statsBy(x: Exam, hist: Hist, r10: Recent = {}): TopicStat<string>[] {
  const m: Record<string, TopicStat<string>> = {};
  x.items.forEach(q => {
    const k = q.f + '|' + q.t;
    const s = (m[k] = m[k] || { f: q.f, t: q.t, total: 0, n: 0, c: 0, recentWrong: 0, rn: (r10[k] || '').length, rc: ones(r10[k] || '') });
    s.total++;
    const h = hist[q.k];
    if (h) { s.n += h.n; s.c += h.c; if (h.last === 0) s.recentWrong++; }
  });
  return Object.values(m);
}
// 分野ごとにまとめた成績（歴史の「分野マップ」用。t は分野の表示名）
// 宅建の合格の見込み用の fieldStats(hist, r10) と区別するため fieldStatsBy とする
export function fieldStatsBy(x: Exam, hist: Hist, r10: Recent = {}): TopicStat<string>[] {
  const all = statsBy(x, hist, r10);
  return x.fields.map(([f, name]) => all.filter(s => s.f === f).reduce(
    (a, s) => ({ ...a, total: a.total + s.total, n: a.n + s.n, c: a.c + s.c, recentWrong: a.recentWrong + s.recentWrong, rn: a.rn + s.rn, rc: a.rc + s.rc }),
    { f, t: name, total: 0, n: 0, c: 0, recentWrong: 0, rn: 0, rc: 0 } as TopicStat<string>,
  ));
}
// 0=未着手 1=要復習 2=習得中 3=習得
export function topicState(s: TopicStat<string>): 0 | 1 | 2 | 3 {
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

// 試験を採点し、新しい進捗を返す。ans は ox なら 1/0、choice なら c の番号
// 記録は record()（全体の記録＋論点ごとの直近10問）。rounds のない試験は回数を数えない
export function finishRound(x: Exam, p: Progress, qs: Item[], ans: (number | null)[], used: number) {
  let cur = p;
  let score = 0;
  qs.forEach((q, k) => { const ok = ans[k] === q.a; if (ok) score++; cur = record(cur, q, ok); });
  const R = x.rounds?.length || 1;
  const round = p.set.round % R;
  const scores = [...p.set.scores];
  scores[round] = score;
  const nextRound = (round + 1) % R;
  const setDone = !!x.rounds && nextRound === 0;
  // このセットで出した論点を記録。セットが終わったら、出し切れなかった論点を次のセットへ持ち越す
  const topics = [...new Set([...(round === 0 ? [] : p.set.topics || []), ...qs.map(q => q.f + '|' + q.t)])];
  const allTopics = [...new Set(x.items.map(q => q.f + '|' + q.t))];
  const carry = setDone ? allTopics.filter(k => !topics.includes(k)) : (p.set.carry || []);
  const next: Progress = {
    ...cur,
    set: x.rounds ? { round: nextRound, scores: setDone ? [] : scores, topics: setDone ? [] : topics, carry } : { round: nextRound, scores: setDone ? [] : scores },
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

// ---- 宅建用（App.tsx の従来の呼び方） ----
export const TAKKEN = EXAM.takken;
export const BANK = TAKKEN.items as Q[];
export const FIELDS = TAKKEN.fields as [Field, string][];
export const fieldName = (f: Field) => FIELDS.find(x => x[0] === f)![1];
export const MIX = TAKKEN.rounds as Record<Field, number>[];
export const LIMIT = TAKKEN.limit;
export const BYKEY: Record<string, Q> = Object.fromEntries(BANK.map(q => [q.k, q]));
export const buildExam = (hist: Hist, round: number, rnd = Math.random, set?: SetState) => buildRound(TAKKEN, hist, round, rnd, set) as Q[];
export const checkQuestions = (hist: Hist, key: string, missed?: Q, rnd = Math.random) => reviewQuestions(TAKKEN, hist, key, missed, rnd);
export function topicStats(hist: Hist, r10: Recent = backfillRecent(hist)): TopicStat[] {
  return statsBy(TAKKEN, hist, r10) as TopicStat[];
}
export const finishExam = (p: Progress, qs: Q[], ans: (0 | 1 | null)[], used: number) => finishRound(TAKKEN, p, qs, ans, used);

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
export const wrongTopics = (qs: Q[], ans: (0 | 1 | null)[]) => wrongGroups(TAKKEN, qs, ans);

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
// 分かる肢の数で判定（見出し）：確実に分かる率 s＝max(0, 2p−1)（○×の当てずっぽう分を除く）。
// 分かる肢の数 K〜二項(4, s)。K≧3 なら正解確定、K＝2 は残り2択で1/2、K＝1 は1/3、K＝0 でも1/4
export const LIMB = -1;
export const LIMB_GUESS = [1 / 4, 1 / 3, 1 / 2, 1, 1];
export const knownRate = (p: number) => Math.max(0, 2 * p - 1);
export function limbExam(p: number): number {
  const s = knownRate(p); const C = [1, 4, 6, 4, 1];
  return C.reduce((a, c, k) => a + c * s ** k * (1 - s) ** (4 - k) * LIMB_GUESS[k], 0);
}
// 肢ごとに分かる率が違う場合（過去問の4択に戻すとき）。16通りの「分かる／分からない」を数え上げる
export function limbExamBy(ps: number[]): number {
  const s = ps.map(knownRate); let P = 0;
  for (let m = 0; m < 16; m++) { let q = 1, K = 0; s.forEach((x, i) => { if (m >> i & 1) { q *= x; K++; } else q *= 1 - x; }); P += q * LIMB_GUESS[K]; }
  return P;
}
// 分かる肢の数の内訳 [0肢,1肢,2肢,3肢以上] の確率
export function limbBreakdown(p: number): number[] {
  const s = knownRate(p); const C = [1, 4, 6, 4, 1]; const d = C.map((c, k) => c * s ** k * (1 - s) ** (4 - k));
  return [d[0], d[1], d[2], d[3] + d[4]];
}
const examRate = (p: number, k: number) => (k === LIMB ? limbExam(p) : toExam(p, k));
export const SCENARIOS = [
  { k: 0, label: '慎重（誤りはすべて思い込み）' },
  { k: LIMB, label: '分かる肢の数で判定（当てずっぽう分を除く）' },
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
    const prob = kind === 'count' ? ps.reduce((a, b) => a * b, 1) : limbExamBy(ps);
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
// 直近の極端な不調で合格確率が下がりすぎないよう、論点ごとに過去平均で補正する
//  ① 直近10問に「その論点の全回答の正答率」を ADJ_PRIOR 問分足してならす（良い方向の偶然も同じくならす）
//  ② それでも過去平均より ADJ_FLOOR 以上は下げない（悪い方向だけの下限）
export const ADJ_PRIOR = 10; // 直近10問と過去平均を半々で見る
export const ADJ_FLOOR = 0.10;
export function adjustTopic(rc: number, rn: number, c: number, n: number): number {
  if (!rn) return n ? c / n : 0;
  const all = n ? c / n : rc / rn;
  const blended = (rc + ADJ_PRIOR * all) / (rn + ADJ_PRIOR);
  return Math.max(blended, all - ADJ_FLOOR);
}
export type AdjRate = { n: number; c: number; raw: number | null; adj: number };
// 分野ごとの合格確率用の成績。n は直近の問題数（不確かさの幅は直近の数で決める）、c は補正後の正答数
export function adjustedRates(hist: Hist, r10: Recent = backfillRecent(hist)): Record<Field, AdjRate> {
  const st = fieldStats(hist, r10);
  const o = {} as Record<Field, AdjRate>;
  FIELDS.forEach(([f]) => { o[f] = { n: 0, c: 0, raw: st[f].rn ? st[f].rc / st[f].rn : null, adj: 0 }; });
  topicStats(hist, r10).forEach(s => { if (!s.rn) return; const r = o[s.f]; r.n += s.rn; r.c += adjustTopic(s.rc, s.rn, s.c, s.n) * s.rn; });
  FIELDS.forEach(([f]) => { const r = o[f], s = st[f]; if (!r.n) { r.n = s.n; r.c = s.c; } r.adj = r.n ? r.c / r.n : 0; });
  return o;
}

export type PassEstimate =
  | { ready: false; total: number; st: Record<Field, FieldStat> }
  | ({ ready: true; total: number; st: Record<Field, FieldStat>; adj: Record<Field, AdjRate>; limbs: number[]; ox: number; oxAdj: number; oxAll: number; rn: number; scen: Scenario[]; focus: Field } & SimResult);
// 分野ごとの正答率の不確かさ（ベータ分布）も含めて本試験50問をシミュレーション
// 論点ごとの計算用：分野ごとに「解いた論点（重み・直近の問題数・補正後の正答数）」と「未着手の論点の重み」
export type TopicPlan = Record<Field, { un: number; tops: { t: string; w: number; n: number; c: number }[] }>;
export const TOPIC_PRIOR = 2; // 解いた数が少ない論点は分野の正答率に2問分寄せる
export function topicPlan(hist: Hist, r10: Recent = backfillRecent(hist)): TopicPlan {
  const o = {} as TopicPlan;
  FIELDS.forEach(([f]) => { o[f] = { un: 0, tops: [] }; });
  const ts = topicStats(hist, r10);
  const tot = {} as Record<Field, number>; FIELDS.forEach(([f]) => { tot[f] = ts.filter(x => x.f === f).reduce((a, x) => a + x.total, 0) || 1; });
  // 重み＝問題集でのその論点の問題数（本試験での出題の多さの目安）
  ts.forEach(x => { const w = x.total / tot[x.f]; if (x.rn) o[x.f].tops.push({ t: x.t, w, n: x.rn, c: adjustTopic(x.rc, x.rn, x.c, x.n) * x.rn }); else o[x.f].un += w; });
  return o;
}
// 4択換算は表引きで高速化（0.1%刻み）
const RATE_TABLE: Record<number, Float64Array> = {};
function examRateFast(p: number, k: number): number {
  let t = RATE_TABLE[k];
  if (!t) { t = RATE_TABLE[k] = new Float64Array(1001); for (let i = 0; i <= 1000; i++) t[i] = examRate(i / 1000, k); }
  return t[Math.round(Math.min(1, Math.max(0, p)) * 1000)];
}
// 分野の4択正答率＝論点ごとの4択正答率を重みで平均（未着手の論点は分野の正答率 pf）
function fieldFour(pl: TopicPlan[Field], pf: number, k: number, draw?: (a: number, b: number) => number): number {
  let x = pl.un * examRateFast(pf, k);
  pl.tops.forEach(t => { const a = t.c + TOPIC_PRIOR * pf, b = t.n - t.c + TOPIC_PRIOR * (1 - pf); x += t.w * examRateFast(draw ? draw(a, b) : a / (a + b), k); });
  return x;
}
// 分かる肢の数の内訳（本試験の配点で重みづけ）
export function planBreakdown(plan: TopicPlan, rs: Record<Field, { n: number; c: number }>): number[] {
  const out = [0, 0, 0, 0];
  FIELDS.forEach(([f]) => {
    const pf = (rs[f].c + 1) / (rs[f].n + 2), wf = EXAM_N[f] / 50, pl = plan[f];
    const add = (p: number, w: number) => limbBreakdown(p).forEach((v, i) => { out[i] += wf * w * v; });
    add(pf, pl.un);
    pl.tops.forEach(t => add((t.c + TOPIC_PRIOR * pf) / (t.n + TOPIC_PRIOR), t.w));
  });
  return out;
}
function simulate(st: Record<Field, { n: number; c: number }>, k: number, sims: number, plan: TopicPlan): SimResult {
  const r = seeded(20261008);
  const beta = (a: number, b: number) => { const x = gammaS(a, r), y = gammaS(b, r); return x / (x + y); };
  const sc: number[] = [];
  for (let i = 0; i < sims; i++) {
    let x = 0;
    FIELDS.forEach(([f]) => {
      const s = st[f]; const pf = beta(s.c + 1, s.n - s.c + 1);
      const p = fieldFour(plan[f], pf, k, beta);
      for (let j = 0; j < EXAM_N[f]; j++) if (r() < p) x++;
    });
    sc.push(x);
  }
  sc.sort((a, b) => a - b);
  const byLine = PASS_LINES.map(t => sc.filter(x => x >= t).length / sims);
  const exp = {} as Record<Field, number>;
  FIELDS.forEach(([f]) => { const s = st[f]; exp[f] = EXAM_N[f] * fieldFour(plan[f], (s.c + 1) / (s.n + 2), k); });
  return {
    k, byLine, prob: byLine.reduce((a, b) => a + b, 0) / byLine.length,
    mean: sc.reduce((a, b) => a + b, 0) / sims, lo: sc[Math.floor(sims * 0.1)], hi: sc[Math.floor(sims * 0.9)],
    exp, four: FIELDS.reduce((a, [f]) => a + exp[f], 0) / 50,
  };
}
// 見出しは「分かる肢の数で判定」。慎重・消去法が効く場合も併せて返す
// 合格確率は論点ごとの直近10問（過去平均で補正）から論点ごとに4択へ換算し、分野で重みづけて合わせる
export function passEstimate(hist: Hist, sims = 3000, r10: Recent = backfillRecent(hist)): PassEstimate {
  const st = fieldStats(hist, r10);
  const total = Object.values(st).reduce((a, s) => a + s.n, 0);
  if (total < 30) return { ready: false, total, st };
  // 直近10問（論点ごと）を過去平均で補正した成績で計算。直近がない分野は全体を使う
  const adj = adjustedRates(hist, r10);
  const rs = {} as Record<Field, { n: number; c: number }>;
  FIELDS.forEach(([f]) => { rs[f] = { n: adj[f].n, c: adj[f].c }; });
  // 論点ごとの正答率から4択に換算して分野で合わせる
  const plan = topicPlan(hist, r10);
  const scen = SCENARIOS.map(x => ({ ...simulate(rs, x.k, sims, plan), label: x.label }));
  const limbs = planBreakdown(plan, rs);
  const M = scen[1];
  const rn = Object.values(rs).reduce((a, s) => a + s.n, 0);
  const oxAdj = Object.values(rs).reduce((a, s) => a + s.c, 0) / rn;
  const rawN = Object.values(st).reduce((a, s) => a + s.rn, 0);
  const ox = rawN ? Object.values(st).reduce((a, s) => a + s.rc, 0) / rawN : oxAdj;
  const oxAll = Object.values(st).reduce((a, s) => a + s.c, 0) / total;
  const focus = FIELDS.map(([f]) => f).sort((a, b) => (EXAM_N[b] - M.exp[b]) - (EXAM_N[a] - M.exp[a]))[0];
  return { ready: true, total, st, adj, ox, oxAdj, oxAll, rn, scen, focus, limbs, ...M };
}
