// 試験パック：1つの試験＝問題＋出題ルール。試験を増やすときはここに1件足す。
import takkenRaw from './data/bank.json';
import sekaishiRaw from './data/rikkyo-sekaishi.json';
import nihonshiRaw from './data/rikkyo-nihonshi.json';
import keioEconWhRaw from './data/keio-econ-sekaishi.json';
import keioEconJhRaw from './data/keio-econ-nihonshi.json';
import keioCommWhRaw from './data/keio-comm-sekaishi.json';
import keioCommJhRaw from './data/keio-comm-nihonshi.json';
import kindaiJhRaw from './data/kindai-nihonshi.json';
import kindaiWhRaw from './data/kindai-sekaishi.json';
import kindaiEnRaw from './data/kindai-eigo.json';
import kindaiKgRaw from './data/kindai-kokugo.json';
import nichidaiJhRaw from './data/nichidai-nihonshi.json';
import nichidaiWhRaw from './data/nichidai-sekaishi.json';
import nichidaiEnRaw from './data/nichidai-eigo.json';
import nichidaiKgRaw from './data/nichidai-kokugo.json';
import meijiJhRaw from './data/meiji-nihonshi.json';
import meijiWhRaw from './data/meiji-sekaishi.json';
import meijiEnRaw from './data/meiji-eigo.json';
import meijiKgRaw from './data/meiji-kokugo.json';
import zrZaihyo from './data/zeirishi-zaihyo.json';
import zrSouzoku from './data/zeirishi-souzoku.json';
import zrShouhi from './data/zeirishi-shouhi.json';
import zrShotoku from './data/zeirishi-shotoku.json';
import tdEigo from './data/todai-eigo.json';
import tdChiri from './data/todai-chiri.json';
import tdSeibutsu from './data/todai-seibutsu.json';
import wsEigo from './data/waseda-eigo.json';
import tdKokugo from './data/todai-kokugo.json';
import tdMathBun from './data/todai-sugaku-bun.json';
import tdMathRi from './data/todai-sugaku-ri.json';
import tdButsuri from './data/todai-butsuri.json';
import tdKagaku from './data/todai-kagaku.json';
import tdNihonshi from './data/todai-nihonshi.json';
import wsNihonshi from './data/waseda-nihonshi.json';
import wsSekaishi from './data/waseda-sekaishi.json';
import wsKokugo from './data/waseda-kokugo.json';
import zrBoki from './data/zeirishi-boki.json';
import zrHoujin from './data/zeirishi-houjin.json';
import tdSekaishi from './data/todai-sekaishi.json';

export type ExamId =
  | 'takken' | 'rikkyo-sekaishi' | 'rikkyo-nihonshi'
  | 'keio-econ-sekaishi' | 'keio-econ-nihonshi' | 'keio-comm-sekaishi' | 'keio-comm-nihonshi'
  | 'kindai-nihonshi' | 'kindai-sekaishi' | 'kindai-eigo' | 'kindai-kokugo' | 'nichidai-nihonshi' | 'nichidai-sekaishi' | 'nichidai-eigo' | 'nichidai-kokugo'
  | 'meiji-nihonshi' | 'meiji-sekaishi' | 'meiji-eigo' | 'meiji-kokugo'
  | 'zeirishi-zaihyo' | 'zeirishi-souzoku' | 'zeirishi-shouhi' | 'zeirishi-shotoku' | 'todai-eigo' | 'todai-chiri' | 'todai-seibutsu' | 'waseda-eigo'
  | 'todai-kokugo' | 'todai-sugaku-bun' | 'todai-sugaku-ri' | 'todai-butsuri' | 'todai-kagaku' | 'todai-nihonshi' | 'waseda-nihonshi' | 'waseda-sekaishi' | 'waseda-kokugo' | 'zeirishi-boki' | 'zeirishi-houjin' | 'todai-sekaishi';
export type Format = 'ox' | 'choice';

// 共通の問題形式。ox は a: 1＝○／0＝×、choice は a＝正解の c の番号
export type Item = {
  k: string;      // 学習記録の安定キー（試験内で一意）
  i: number;      // 試験内の通し番号
  f: string;      // 分野
  t: string;      // 論点
  ref: string;    // 出典
  p?: string;     // 本文（英語・国語の読解。問題ごとに持つ）
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
  group: string;                              // 入口の画面での見出し（資格試験／大学入試）
  desc: string;                               // 入口とホームに出す一文
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
  id: number; ref: string; f: string; t: string; y?: number; p?: string; q: string; c: string[];
  e: string; m: string; a?: number; last?: boolean; k?: string;
};
const rikkyoItems = (raw: RikkyoRaw[]): Item[] =>
  raw.map((q, i) => ({
    k: String(q.id), i, f: q.f, t: q.t, ref: q.ref, p: q.p, s: q.q, c: q.c, fix: !!q.last,
    a: q.a ?? 0, e: q.e, m: q.m, y: q.y, kind: q.k,
  }));

// 分野の並び：各分野の平均年代の古い順（Web版の web/keio/build.py と同じ）
const fieldsByYear = (items: Item[]): [string, string][] => {
  const by: Record<string, number[]> = {};
  items.forEach(q => (by[q.f] = by[q.f] || []).push(q.y ?? 0));
  if (items.every(q => q.y === undefined)) return Object.keys(by).map(f => [f, f]); // 英語・国語は出てきた順
  const avg = (f: string) => by[f].reduce((a, b) => a + b, 0) / by[f].length;
  return Object.keys(by).sort((a, b) => avg(a) - avg(b)).map(f => [f, f]);
};
// 慶應：立教と同じ形式。区分は 過去問ベース／想定問題
const keio = (id: ExamId, name: string, short: string, raw: unknown): Exam => {
  const items = rikkyoItems(raw as RikkyoRaw[]);
  return {
    id, name, short, group: '大学入試', desc: '過去問の知識をもとにした4択。時代をまんべんなく10問。', format: 'choice', fields: fieldsByYear(items), size: 10, limit: 600, reviewBy: 'field',
    kinds: [['past', '過去問ベース'], ['plan', '想定問題']], storageKey: `exam-progress-v1:${id}`, items,
  };
};

// 早稲田・明治・日大・近大など：立教と同じ形式。科目で説明文を変える（英語・国語は年 y なし）
const DESC: Record<string, string> = {
  nihonshi: '過去問の知識をもとにした4択。時代をまんべんなく10問。',
  sekaishi: '過去問の知識をもとにした4択。地域・時代をまんべんなく10問。',
  eigo: '文法・語彙・会話・読解の4択。英文はすべて自作。10問10分。',
  kokugo: '漢字・語彙・現代文・古文の4択。現代文の本文は自作。10問10分。',
  chiri: '過去問の論点をもとにした4択。地形・産業・人口などを10問。',
  'sugaku-bun': '過去問の誘導を小問にした4択。答えはすべて計算で確認済み。',
  'sugaku-ri': '過去問の誘導を小問にした4択。答えはすべて計算で確認済み。',
  butsuri: '過去問の設定を小問にした4択。式と値はすべて計算で確認済み。',
  kagaku: '理論・無機・有機の4択。数値はすべて計算で確認済み。',
  seibutsu: '実験考察と知識の4択。結果は文章で示す。10問10分。',
  boki: '論点ごとの計算小問を4択で。10問10分。',
  zaihyo: '理論（会計基準）と計算の4択。10問10分。',
  houjin: '理論と計算の4択。令和8年4月3日現在の法令。',
  shotoku: '理論と計算の4択。計算は令和7年分。',
  shouhi: '理論と計算の4択。インボイスの経過措置を含む。',
  souzoku: '理論と計算の4択。令和8年4月3日現在の法令。',
};
const univ = (id: ExamId, name: string, short: string, raw: unknown): Exam => {
  const items = rikkyoItems(raw as RikkyoRaw[]);
  const sub = id.slice(id.indexOf('-') + 1);
  return {
    id, name, short, group: id.startsWith('zeirishi-') ? '資格試験' : '大学入試', desc: DESC[sub], format: 'choice', fields: fieldsByYear(items), size: 10, limit: 600,
    reviewBy: 'field', kinds: [['past', '過去問ベース'], ['plan', '想定問題']], storageKey: `exam-progress-v1:${id}`, items,
  };
};

export const EXAMS: Exam[] = [
  {
    id: 'takken', name: '宅建 10分模試', short: '宅建', group: '資格試験',
    desc: '本試験と同じ分野比率の○×10問。5回で本試験1回分。', format: 'ox',
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
    id: 'rikkyo-sekaishi', name: '立教 世界史', short: '世界史', group: '大学入試',
    desc: '過去問をもとにした4〜5択。地域・時代をまんべんなく10問。', format: 'choice',
    fields: ['欧米（古代・中世）', '欧米（近世・近代）', '西・南アジア、アフリカ', '東アジア・日本', '20世紀・現代'].map(f => [f, f]),
    size: 10, limit: 600, reviewBy: 'field', storageKey: 'exam-progress-v1:rikkyo-sekaishi',
    items: rikkyoItems(sekaishiRaw as RikkyoRaw[]),
  },
  {
    id: 'rikkyo-nihonshi', name: '立教 日本史', short: '日本史', group: '大学入試',
    desc: '過去問ベースと想定問題の4〜5択。時代をまんべんなく10問。', format: 'choice',
    fields: ['原始・古代', '中世', '近世', '近代', '現代'].map(f => [f, f]),
    size: 10, limit: 600, reviewBy: 'field',
    kinds: [['past', '過去問ベース'], ['plan', '想定問題']],
    storageKey: 'exam-progress-v1:rikkyo-nihonshi',
    items: rikkyoItems(nihonshiRaw as RikkyoRaw[]),
  },
  keio('keio-econ-sekaishi', '慶應 経済学部 世界史', '慶應経済 世界史', keioEconWhRaw),
  keio('keio-econ-nihonshi', '慶應 経済学部 日本史', '慶應経済 日本史', keioEconJhRaw),
  keio('keio-comm-sekaishi', '慶應 商学部 世界史', '慶應商 世界史', keioCommWhRaw),
  keio('keio-comm-nihonshi', '慶應 商学部 日本史', '慶應商 日本史', keioCommJhRaw),
  univ('kindai-nihonshi', '近畿大学 日本史', '近大 日本史', kindaiJhRaw),
  univ('kindai-sekaishi', '近畿大学 世界史', '近大 世界史', kindaiWhRaw),
  univ('kindai-eigo', '近畿大学 英語', '近大 英語', kindaiEnRaw),
  univ('kindai-kokugo', '近畿大学 国語', '近大 国語', kindaiKgRaw),
  univ('nichidai-nihonshi', '日本大学 日本史', '日大 日本史', nichidaiJhRaw),
  univ('nichidai-sekaishi', '日本大学 世界史', '日大 世界史', nichidaiWhRaw),
  univ('nichidai-eigo', '日本大学 英語', '日大 英語', nichidaiEnRaw),
  univ('nichidai-kokugo', '日本大学 国語', '日大 国語', nichidaiKgRaw),
  univ('meiji-nihonshi', '明治大学 日本史', '明治 日本史', meijiJhRaw),
  univ('meiji-sekaishi', '明治大学 世界史', '明治 世界史', meijiWhRaw),
  univ('meiji-eigo', '明治大学 英語', '明治 英語', meijiEnRaw),
  univ('meiji-kokugo', '明治大学 国語', '明治 国語', meijiKgRaw),
  univ('zeirishi-zaihyo', '税理士 財務諸表論', '財務諸表論', zrZaihyo),
  univ('zeirishi-souzoku', '税理士 相続税法', '相続税法', zrSouzoku),
  univ('zeirishi-shouhi', '税理士 消費税法', '消費税法', zrShouhi),
  univ('zeirishi-shotoku', '税理士 所得税法', '所得税法', zrShotoku),
  univ('todai-eigo', '東京大学 英語', '東大 英語', tdEigo),
  univ('todai-chiri', '東京大学 地理', '東大 地理', tdChiri),
  univ('todai-seibutsu', '東京大学 生物', '東大 生物', tdSeibutsu),
  univ('waseda-eigo', '早稲田大学 英語', '早稲田 英語', wsEigo),
  univ('todai-kokugo', '東京大学 国語', '東大 国語', tdKokugo),
  univ('todai-sugaku-bun', '東京大学 数学（文科）', '東大 数学文科', tdMathBun),
  univ('todai-sugaku-ri', '東京大学 数学（理科）', '東大 数学理科', tdMathRi),
  univ('todai-butsuri', '東京大学 物理', '東大 物理', tdButsuri),
  univ('todai-kagaku', '東京大学 化学', '東大 化学', tdKagaku),
  univ('todai-nihonshi', '東京大学 日本史', '東大 日本史', tdNihonshi),
  univ('waseda-nihonshi', '早稲田大学 日本史', '早稲田 日本史', wsNihonshi),
  univ('waseda-sekaishi', '早稲田大学 世界史', '早稲田 世界史', wsSekaishi),
  univ('waseda-kokugo', '早稲田大学 国語', '早稲田 国語', wsKokugo),
  univ('zeirishi-boki', '税理士 簿記論', '簿記論', zrBoki),
  univ('zeirishi-houjin', '税理士 法人税法', '法人税法', zrHoujin),
  univ('todai-sekaishi', '東京大学 世界史', '東大 世界史', tdSekaishi),
];

export const EXAM: Record<ExamId, Exam> = Object.fromEntries(EXAMS.map(x => [x.id, x])) as Record<ExamId, Exam>;
const byKeyCache = new Map<ExamId, Record<string, Item>>();
export function byKey(x: Exam): Record<string, Item> {
  let m = byKeyCache.get(x.id);
  if (!m) { m = Object.fromEntries(x.items.map(q => [q.k, q])); byKeyCache.set(x.id, m); }
  return m;
}
