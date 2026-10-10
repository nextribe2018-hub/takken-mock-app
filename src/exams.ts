// 試験パック：1つの試験＝問題＋出題ルール。試験を増やすときはここに1件足す。
import takkenRaw from './data/bank.json';
import sekaishiRaw from './data/rikkyo-sekaishi.json';
import nihonshiRaw from './data/rikkyo-nihonshi.json';

export type ExamId = 'takken' | 'rikkyo-sekaishi' | 'rikkyo-nihonshi';
export type Format = 'ox' | 'choice';

// 共通の問題形式。ox は a: 1＝○／0＝×、choice は a＝正解の c の番号
export type Item = {
  k: string;      // 学習記録の安定キー（試験内で一意）
  i: number;      // 試験内の通し番号
  f: string;      // 分野
  t: string;      // 論点
  ref: string;    // 出典
  s: string;      // 問題文
  c?: string[];   // 選択肢（choice のみ）
  fix?: boolean;  // 最後の選択肢（「すべて正しい」等）を末尾に固定
  a: number;
  e: string;      // 解説
  m: string;      // 覚え方
  y?: number;     // 年（歴史。紀元前はマイナス）
  kind?: string;  // 出題区分（例 past／plan）
};

export type Exam = {
  id: ExamId;
  name: string;
  short: string;
  format: Format;
  fields: [string, string][];                 // [分野キー, 表示名]
  size: number;                               // 1回の問題数
  limit: number;                              // 制限時間（秒）
  rounds?: Record<string, number>[];          // 回ごとの分野内訳。なければ問題数に比例
  reviewBy: 'topic' | 'field';                // 復習のまとまり
  kinds?: [string, string][];                 // 出題区分 [キー, 表示名]
  storageKey: string;
  items: Item[];
};

// 宅建：安定キーは 分野|論点|出典（重複は #n）。既存の学習記録と互換
type TakkenRaw = { f: string; t: string; ref: string; s: string; a: 0 | 1; e: string; m: string };
const takkenItems = (): Item[] => {
  const seen: Record<string, number> = {};
  return (takkenRaw as TakkenRaw[]).map((q, i) => {
    let k = `${q.f}|${q.t}|${q.ref}`;
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > 1) k += '#' + seen[k];
    return { ...q, i, k };
  });
};

// 立教：安定キーは id（Web版の学習記録と同じ）
type RikkyoRaw = {
  id: number; ref: string; f: string; t: string; y: number; q: string; c: string[];
  e: string; m: string; a?: number; last?: boolean; k?: string;
};
const rikkyoItems = (raw: RikkyoRaw[]): Item[] =>
  raw.map((q, i) => ({
    k: String(q.id), i, f: q.f, t: q.t, ref: q.ref, s: q.q, c: q.c, fix: !!q.last,
    a: q.a ?? 0, e: q.e, m: q.m, y: q.y, kind: q.k,
  }));

export const EXAMS: Exam[] = [
  {
    id: 'takken', name: '宅建 10分模試', short: '宅建', format: 'ox',
    fields: [['業法', '宅建業法'], ['権利', '権利関係'], ['法令', '法令上の制限'], ['税他', '税・その他']],
    size: 10, limit: 600,
    // 5回で本試験50問の比率（業法20・権利14・法令8・税他8）
    rounds: [
      { 業法: 4, 権利: 3, 法令: 2, 税他: 1 },
      { 業法: 4, 権利: 3, 法令: 2, 税他: 1 },
      { 業法: 4, 権利: 3, 法令: 2, 税他: 1 },
      { 業法: 4, 権利: 3, 法令: 1, 税他: 2 },
      { 業法: 4, 権利: 2, 法令: 1, 税他: 3 },
    ],
    reviewBy: 'topic', storageKey: 'tkm-progress-v2', items: takkenItems(),
  },
  {
    id: 'rikkyo-sekaishi', name: '立教 世界史', short: '世界史', format: 'choice',
    fields: ['欧米（古代・中世）', '欧米（近世・近代）', '西・南アジア、アフリカ', '東アジア・日本', '20世紀・現代'].map(f => [f, f]),
    size: 10, limit: 600, reviewBy: 'field', storageKey: 'exam-progress-v1:rikkyo-sekaishi',
    items: rikkyoItems(sekaishiRaw as RikkyoRaw[]),
  },
  {
    id: 'rikkyo-nihonshi', name: '立教 日本史', short: '日本史', format: 'choice',
    fields: ['原始・古代', '中世', '近世', '近代', '現代'].map(f => [f, f]),
    size: 10, limit: 600, reviewBy: 'field',
    kinds: [['past', '過去問ベース'], ['plan', '想定問題']],
    storageKey: 'exam-progress-v1:rikkyo-nihonshi',
    items: rikkyoItems(nihonshiRaw as RikkyoRaw[]),
  },
];

export const EXAM: Record<ExamId, Exam> = Object.fromEntries(EXAMS.map(x => [x.id, x])) as Record<ExamId, Exam>;
const byKeyCache = new Map<ExamId, Record<string, Item>>();
export function byKey(x: Exam): Record<string, Item> {
  let m = byKeyCache.get(x.id);
  if (!m) { m = Object.fromEntries(x.items.map(q => [q.k, q])); byKeyCache.set(x.id, m); }
  return m;
}
