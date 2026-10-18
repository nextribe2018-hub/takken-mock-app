// 1分トライアル：30語の4択を1分で解き、正解数＋余った秒数（1秒＝1点）を得点にする。
// 出題の2〜3割は解いたことのある語を間隔をあけて再出題し、習得の進み具合と忘却率を測る。
// 画面に依存しない純粋な関数だけ（npm test で検査）。
import { Exam, Item } from './exams';
import { Hist, Progress, jstNow, shuffle } from './logic';

export type Dir = 'ej' | 'je';
export const TRIAL_N = 30;
export const TRIAL_SEC = 60;
export const REPEAT_RATE = 0.25; // 再出題の目安（2〜3割）

// 前回解いてからの間隔の区分（上限の日数, 表示名）。忘却率はこの区分ごとに出す
export const GAPS: [number, string][] = [[1, '1日未満'], [3, '1〜3日'], [7, '3〜7日'], [30, '1週間〜1か月'], [Infinity, '1か月以上']];
export const gapBucket = (ms: number) => Math.max(0, GAPS.findIndex(([lim]) => ms / 864e5 < lim));
// 記憶力スコアの重み：長い間隔を覚えているほど高く評価する
const GAP_W = [1, 1.5, 2, 2.5, 3];

// 1回の記録。ret は区分ごとの [前回正解だった再出題の数, そのうち今回も正解した数]
export type Trial = {
  at: string; f: string; dir: Dir;
  n: number;        // 出題数
  ans: number;      // 答えた数（時間切れなら n より少ない）
  ok: number;       // 正解数
  sec: number;      // かかった秒（小数）
  remain: number;   // 余った秒（1秒＝1点）
  score: number;    // ok + remain
  rep: number;      // 再出題の数
  ret: [number, number][];
  newN: number; newOk: number; // 初めて出た語の数と正解数
};

const dirPool = (x: Exam, dir: Dir) => (dir === 'je' && x.rev?.length ? x.rev : x.items);

// 30語を選ぶ。再出題は目安25%（未出題の語が足りなければ増える）。
// 再出題は「前回正解した語（忘れていないか）」と「前回間違えた語（覚え直し）」を半々、前回解いてから長く経った語を優先
export function pickTrial(x: Exam, hist: Hist, f: string, dir: Dir, n = TRIAL_N, rnd = Math.random): Item[] {
  const pool = dirPool(x, dir).filter(q => q.f === f);
  const seen = pool.filter(q => hist[q.k]), fresh = pool.filter(q => !hist[q.k]);
  const want = Math.min(n, pool.length);
  const repN = Math.min(seen.length, Math.max(Math.round(want * REPEAT_RATE), want - fresh.length));
  // 古い順に並べ、先頭の2倍の範囲から選ぶ（毎回同じ語にならないように）
  const oldest = (a: Item[], k: number) => {
    const s = [...a].sort((p, q) => (hist[p.k].at ?? 0) - (hist[q.k].at ?? 0));
    return shuffle(s.slice(0, Math.max(k * 2, k)), rnd).slice(0, k);
  };
  const ng = seen.filter(q => hist[q.k].last === 0), ok = seen.filter(q => hist[q.k].last === 1);
  const ngN = Math.min(ng.length, Math.ceil(repN / 2));
  const okN = Math.min(ok.length, repN - ngN);
  const reps = [...oldest(ng, ngN), ...oldest(ok, okN)];
  if (reps.length < repN) {
    const rest = seen.filter(q => !reps.includes(q));
    reps.push(...oldest(rest, repN - reps.length));
  }
  const news = shuffle(fresh, rnd).slice(0, want - reps.length);
  return shuffle([...reps, ...news], rnd);
}

export type TrialResult = {
  f: string; dir: Dir; n: number; ans: number; ok: number; sec: number; remain: number; score: number;
  rep: number; repOk: number; retTested: number; retKept: number; newN: number; newOk: number;
  rank: number; total: number; best: number; // 自分の記録の中での順位（同じ級・同じ向き）
};

// 採点して記録する。答えていない語（時間切れ）は記録しない
export function finishTrial(p: Progress, f: string, dir: Dir, qs: Item[], ans: (number | null)[], usedMs: number, now = Date.now()) {
  const hist: Hist = { ...p.hist };
  let ok = 0, answered = 0, rep = 0, repOk = 0, newN = 0, newOk = 0;
  const ret: [number, number][] = GAPS.map(() => [0, 0]);
  qs.forEach((q, k) => {
    const a = ans[k];
    if (a == null) return;
    answered++;
    const good = a === q.a;
    if (good) ok++;
    const h = hist[q.k];
    if (h) {
      rep++;
      if (good) repOk++;
      if (h.last === 1) { const b = gapBucket(now - (h.at ?? now)); ret[b][0]++; if (good) ret[b][1]++; }
      hist[q.k] = { n: h.n + 1, c: h.c + (good ? 1 : 0), last: good ? 1 : 0, at: now, pat: h.at, st: good ? (h.st ?? (h.last ? 1 : 0)) + 1 : 0 };
    } else {
      newN++;
      if (good) newOk++;
      hist[q.k] = { n: 1, c: good ? 1 : 0, last: good ? 1 : 0, at: now, st: good ? 1 : 0 };
    }
  });
  const done = answered === qs.length;
  const remain = done ? Math.max(0, Math.floor((TRIAL_SEC * 1000 - usedMs) / 1000)) : 0;
  const score = ok + remain;
  const sec = Math.round(Math.min(TRIAL_SEC * 1000, usedMs) / 100) / 10;
  const t: Trial = { at: jstNow(), f, dir, n: qs.length, ans: answered, ok, sec, remain, score, rep, ret, newN, newOk };
  const same = (p.trials ?? []).filter(o => o.f === f && o.dir === dir);
  const rank = same.filter(o => o.score > score).length + 1;
  const best = Math.max(score, ...same.map(o => o.score));
  const next: Progress = { ...p, hist, trials: [...(p.trials ?? []), t].slice(-1000) };
  const r: TrialResult = {
    f, dir, n: qs.length, ans: answered, ok, sec, remain, score, rep, repOk,
    retTested: ret.reduce((s, b) => s + b[0], 0), retKept: ret.reduce((s, b) => s + b[1], 0),
    newN, newOk, rank, total: same.length + 1, best,
  };
  return { next, r };
}

/* ---------- 記憶力 ---------- */
export type Memory = {
  score: number | null;  // 0〜100。再出題（前回正解）が20語に満たないうちは null
  level: number; label: string; tested: number; kept: number;
  gaps: { name: string; tested: number; kept: number }[]; // 間隔ごとの忘却率の元
};
export const MEM_MIN = 20;
export const MEM_LEVELS: [number, string][] = [[0, 'これから'], [40, '芽ばえ'], [55, '成長中'], [70, 'しっかり'], [80, '強い記憶'], [90, 'とても強い'], [96, '達人']];
export const memLevel = (score: number) => MEM_LEVELS.filter(([min]) => score >= min).length;

// 直近 last 回のトライアルから記憶力スコアを出す。
// スコア＝「前回正解した語を、間隔をあけて再出題したとき覚えていた割合」。長い間隔ほど重みを大きくする
export function memoryStats(trials: Trial[] = [], last = 20): Memory {
  const recent = trials.slice(-last);
  const gaps = GAPS.map(([, name], b) => ({
    name,
    tested: recent.reduce((s, t) => s + (t.ret[b]?.[0] ?? 0), 0),
    kept: recent.reduce((s, t) => s + (t.ret[b]?.[1] ?? 0), 0),
  }));
  const tested = gaps.reduce((s, g) => s + g.tested, 0), kept = gaps.reduce((s, g) => s + g.kept, 0);
  const wT = gaps.reduce((s, g, b) => s + g.tested * GAP_W[b], 0), wK = gaps.reduce((s, g, b) => s + g.kept * GAP_W[b], 0);
  const score = tested >= MEM_MIN && wT > 0 ? Math.round((wK / wT) * 100) : null;
  const level = score == null ? 0 : memLevel(score);
  return { score, level, label: score == null ? `あと${MEM_MIN - tested}語で判定` : `Lv.${level} ${MEM_LEVELS[level - 1][1]}`, tested, kept, gaps };
}

// 週ごとの記憶力スコアの推移（その週に再出題が8語以上あった週だけ）
export function memoryTrend(trials: Trial[] = [], minTested = 8): { week: string; score: number; tested: number }[] {
  const byWeek = new Map<string, Trial[]>();
  for (const t of trials) {
    const d = new Date(t.at + 'Z');
    const day = (d.getUTCDay() + 6) % 7; // 月曜始まり
    const mon = new Date(d.getTime() - day * 864e5);
    const w = `${String(mon.getUTCMonth() + 1)}/${String(mon.getUTCDate())}`;
    const key = `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, '0')}-${String(mon.getUTCDate()).padStart(2, '0')}|${w}`;
    byWeek.set(key, [...(byWeek.get(key) ?? []), t]);
  }
  return [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, ts]) => {
    const m = memoryStats(ts, ts.length);
    const wT = m.gaps.reduce((s, g, b) => s + g.tested * GAP_W[b], 0), wK = m.gaps.reduce((s, g, b) => s + g.kept * GAP_W[b], 0);
    return { week: key.split('|')[1], score: wT > 0 ? Math.round((wK / wT) * 100) : 0, tested: m.tested };
  }).filter(w => w.tested >= minTested);
}

/* ---------- 偏差値（端末内：仮の基準分布） ---------- */
// 参加者のスコアを集める仕組みができるまでの仮の基準。英→和は平均18点・標準偏差10、和→英は平均15点・標準偏差9 と置く
export const REF: Record<Dir, { mu: number; sd: number }> = { ej: { mu: 18, sd: 10 }, je: { mu: 15, sd: 9 } };
export const tScore = (score: number, dir: Dir) => Math.round(50 + (10 * (score - REF[dir].mu)) / REF[dir].sd);
// 標準正規分布の上側確率（上位何%か）
export function topPercent(t: number): number {
  const z = (t - 50) / 10;
  const p = 0.5 * (1 + erf(z / Math.SQRT2));
  return Math.max(0.1, Math.round((1 - p) * 1000) / 10);
}
function erf(x: number): number {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/* ---------- 習得の進捗 ---------- */
// 未着手／学習中（解いたが前回不正解）／覚えた（前回正解）／定着（2回続けて正解し、その間が1日以上）
export type Mastery = { fresh: number; learning: number; known: number; solid: number };
export function mastery(items: Item[], hist: Hist): Mastery {
  const m: Mastery = { fresh: 0, learning: 0, known: 0, solid: 0 };
  for (const q of items) {
    const h = hist[q.k];
    if (!h) m.fresh++;
    else if (h.last === 0) m.learning++;
    else if ((h.st ?? 1) >= 2 && h.pat != null && h.at != null && h.at - h.pat >= 864e5) m.solid++;
    else m.known++;
  }
  return m;
}

// 級・向きごとのスコアの記録
export function trialSummary(trials: Trial[] = [], f: string, dir: Dir) {
  const same = trials.filter(t => t.f === f && t.dir === dir);
  const best = same.length ? Math.max(...same.map(t => t.score)) : null;
  const last = same.length ? same[same.length - 1] : null;
  const avg5 = same.length ? Math.round(same.slice(-5).reduce((s, t) => s + t.score, 0) / Math.min(5, same.length)) : null;
  return { n: same.length, best, last, avg5, list: same };
}
