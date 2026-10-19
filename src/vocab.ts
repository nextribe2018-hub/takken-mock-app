// 英単語モード：30語を1分で覚える → 1分でテスト（正解で+0.5秒）→ 得点＝残り秒＋正解数。
// 300語覚えるごとに「過去に間違えた語だけ」で30語1分の定着テスト。
// 画面（App.tsx の Vocab〜）と Web版（web/vocab/）から同じ仕様で使う。
import vocabRaw from './data/vocab.json';

export type Word = { w: string; m: string; p: string };           // 語・意味・品詞
export type Level = { id: string; name: string; desc: string; ref: string; words: Word[] };  // ref＝参考レベル（英検・高校・大学）
// レベルは TOEIC 500〜900 の100点刻み。旧id（2026-10-19 以前の記録）→ 新id
export const LEVEL_ALIAS: Record<string, string> = { jhs: 'toeic500', eiken: 'toeic600', toeic: 'toeic700', march: 'toeic800', sokei: 'toeic900' };
export const LEVELS: Level[] = vocabRaw as Level[];
export const LEVEL: Record<string, Level> = Object.fromEntries(LEVELS.map(l => [l.id, l]));

export const ROUND_SIZE = 30;      // 1回に覚える語数
export const MEMO_SEC = 60;        // 暗記の時間
export const TEST_SEC = 60;        // テストの時間
export const BONUS_SEC = 0.5;      // 正解1問ごとに延びる秒
export const FIX_EVERY = 300;      // 定着テストの間隔（覚えた語数）
export const CHOICES = 4;          // 意味の選択肢の数

export type WordHist = { n: number; c: number; last: 0 | 1 };    // 出題数・正解数・最後の正誤
export type RoundLog = {
  at: number;                 // 実施時刻
  kind: 'round' | 'fix';      // 通常／定着テスト
  score: number;              // 得点＝残り秒（切り捨て）＋正解数
  correct: number;            // 正解数
  asked: number;              // 解答した数（時間切れなら30未満）
  size: number;               // 出題数
  left: number;               // 残り秒（小数1桁）
  wrong: string[];            // 間違えた語（未解答も含む）
};
export type LevelProgress = {
  cursor: number;             // 次に覚える語の位置（0,30,60…。300で一周して0に戻る）
  learned: number;            // これまでに覚えた延べ語数（30ずつ増える。定着テストの判定に使う）
  lastFix: number;            // 定着テストを実施した時点の learned
  hist: Record<string, WordHist>;
  log: RoundLog[];
};
export type VocabProgress = { v: 1; levels: Record<string, LevelProgress> };

export const emptyLevel = (): LevelProgress => ({ cursor: 0, learned: 0, lastFix: 0, hist: {}, log: [] });
export const emptyVocab = (): VocabProgress => ({ v: 1, levels: {} });
export const levelOf = (p: VocabProgress, id: string): LevelProgress => p.levels[id] ?? emptyLevel();

// 乱数（再現できるように seed つき。seed 省略で Math.random）
export function rng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function shuffle<T>(a: T[], r: () => number = Math.random): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// 次の30語：cursor から順に。レベルを一周したら、間違いの多い語から優先して並べ直した2周目に入る
export function nextWords(level: Level, lp: LevelProgress): Word[] {
  const n = level.words.length;
  const start = lp.cursor % n;
  const order = lp.learned >= n ? weakOrder(level, lp) : level.words;
  const out: Word[] = [];
  for (let i = 0; i < ROUND_SIZE && i < n; i++) out.push(order[(start + i) % n]);
  return out;
}
// 2周目以降の並び：誤答率が高い語 → 出題が少ない語 → 元の順
export function weakOrder(level: Level, lp: LevelProgress): Word[] {
  const miss = (w: Word) => { const h = lp.hist[w.w]; return h ? (h.n - h.c) / h.n + (h.last === 0 ? 1 : 0) : 0.5; };
  return level.words.map((w, i) => ({ w, i, s: miss(w) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.w);
}

export type Question = { w: Word; choices: string[]; a: number };   // a＝正解の choices 番号

// テスト問題：語 → 意味の4択。他の選択肢は同じレベルの別の語の意味（同じ意味文は避ける）
export function buildTest(words: Word[], level: Level, r: () => number = Math.random): Question[] {
  const pool = level.words;
  return shuffle(words, r).map(w => {
    const used = new Set([w.m]);
    const others: string[] = [];
    let guard = 0;
    while (others.length < CHOICES - 1 && guard++ < 500) {
      const o = pool[Math.floor(r() * pool.length)];
      if (!used.has(o.m)) { used.add(o.m); others.push(o.m); }
    }
    const choices = shuffle([w.m, ...others], r);
    return { w, choices, a: choices.indexOf(w.m) };
  });
}

// 得点：残り秒は切り捨て。時間切れ（left<=0）なら残り秒0
export const scoreOf = (left: number, correct: number): number => Math.max(0, Math.floor(left + 1e-9)) + correct;

export type Result = { w: Word; ok: boolean; answered: boolean };

// 1回（通常）を記録：履歴・cursor・learned・log を更新。定着テストが必要になったら fixDue が true。
// repeat＝同じ30語のやり直し（記録は残すが cursor・learned は進めない）
export function finishRound(lp: LevelProgress, level: Level, res: Result[], left: number, repeat = false): { next: LevelProgress; log: RoundLog; fixDue: boolean } {
  const next = applyResults(lp, res);
  const n = level.words.length;
  if (!repeat) {
    next.cursor = (lp.cursor + res.length) % n;
    next.learned = lp.learned + res.length;
  }
  const log = makeLog('round', res, left);
  next.log = [...lp.log, log];
  return { next, log, fixDue: fixDue(next) };
}

// 定着テストの対象：これまでに1回でも間違えた語（誤答率が高い順 → 最後に間違えた語を優先）。最大30語
export function fixWords(level: Level, lp: LevelProgress): Word[] {
  const wrong = level.words
    .map(w => ({ w, h: lp.hist[w.w] }))
    .filter(x => x.h && x.h.c < x.h.n)
    .sort((a, b) => (b.h!.n - b.h!.c) / b.h!.n - (a.h!.n - a.h!.c) / a.h!.n || (b.h!.last === 0 ? 1 : 0) - (a.h!.last === 0 ? 1 : 0));
  return wrong.slice(0, ROUND_SIZE).map(x => x.w);
}
export const fixDue = (lp: LevelProgress): boolean => lp.learned > 0 && lp.learned % FIX_EVERY === 0 && lp.lastFix < lp.learned;

// 定着テストを記録（cursor は進めない）。間違いがなく対象語が0のときは記録だけ残して済ませる
export function finishFix(lp: LevelProgress, res: Result[], left: number): { next: LevelProgress; log: RoundLog } {
  const next = applyResults(lp, res);
  next.lastFix = lp.learned;
  const log = makeLog('fix', res, left);
  next.log = [...lp.log, log];
  return { next, log };
}
export function skipFix(lp: LevelProgress): LevelProgress { return { ...lp, lastFix: lp.learned }; }

function applyResults(lp: LevelProgress, res: Result[]): LevelProgress {
  const hist = { ...lp.hist };
  res.forEach(x => {
    const h = hist[x.w.w] ?? { n: 0, c: 0, last: 0 as 0 | 1 };
    hist[x.w.w] = { n: h.n + 1, c: h.c + (x.ok ? 1 : 0), last: x.ok ? 1 : 0 };
  });
  return { ...lp, hist };
}
function makeLog(kind: RoundLog['kind'], res: Result[], left: number): RoundLog {
  const correct = res.filter(x => x.ok).length;
  const asked = res.filter(x => x.answered).length;
  const l = Math.max(0, Math.round(left * 10) / 10);
  return { at: Date.now(), kind, score: scoreOf(l, correct), correct, asked, size: res.length, left: l, wrong: res.filter(x => !x.ok).map(x => x.w.w) };
}

// 記録のまとめ（ホーム・結果画面用）
export type Stats = { rounds: number; best: number; avg: number; bestCorrect: number; total: number; totalCorrect: number; wrongCount: number; mastered: number; fixes: number; fixAvg: number };
export function stats(level: Level, lp: LevelProgress): Stats {
  const rs = lp.log.filter(l => l.kind === 'round');
  const fx = lp.log.filter(l => l.kind === 'fix');
  const avg = (a: RoundLog[]) => a.length ? Math.round(a.reduce((s, l) => s + l.score, 0) / a.length * 10) / 10 : 0;
  const hs = Object.values(lp.hist);
  return {
    rounds: rs.length, best: Math.max(0, ...rs.map(l => l.score)), avg: avg(rs), bestCorrect: Math.max(0, ...rs.map(l => l.correct)),
    total: rs.reduce((s, l) => s + l.size, 0), totalCorrect: rs.reduce((s, l) => s + l.correct, 0),
    wrongCount: level.words.filter(w => { const h = lp.hist[w.w]; return h && h.c < h.n; }).length,
    mastered: hs.filter(h => h.n >= 2 && h.c === h.n).length, fixes: fx.length, fixAvg: avg(fx),
  };
}
// 判定の一言（30問・1分。満点は 60＋30＝90 に近い値）
export function judge(score: number, correct: number, size: number): string {
  const r = size ? correct / size : 0;
  if (r >= 0.95 && score >= 70) return '完璧。次の30語へ';
  if (r >= 0.8) return '定着しています';
  if (r >= 0.6) return 'もう一息。間違えた語をもう一度';
  return '要復習。同じ30語をやり直すのがおすすめ';
}
