import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { EXAM, Exam, ExamId, Item } from './src/exams';
import {
  buildFieldExam, EXAM_N, FIELDS, fieldStats, finishFieldExam, PASS_LINES, passEstimate, LESSON, Progress, Q,
  buildRound, choiceOrder, emptyProgress, fieldStatsBy, finishRound, freeExam, judge, pick, judgeSet, LessonSys, record,
  relatedBranch, relatedRows, relatedTraps, reviewQuestions, reviewCount, reviewJudge, statsBy, topicState, topicTier, Tier, fourChoice, orderExamples, orderByKw, Lesson, wrongGroups,
} from './src/logic';
import { loadLastExam, loadProgress, loadUnlocked, loadVocab, saveLastExam, saveProgress, saveUnlocked, saveVocab } from './src/storage';
import { StoreState, buy, restore, startStore } from './src/purchase';
import { APP_EXAMS, PRICE_LABEL, SINGLE, skuFor } from './src/variant';
import { VocabApp } from './src/VocabScreens';
import { LEVELS as VOCAB_LEVELS, VocabProgress, levelOf as vocabLevelOf, stats as vocabStats, fixDue as vocabFixDue } from './src/vocab';
import { Colors, fonts, useColors, mix } from './src/theme';
import notesRaw from './src/data/notes.json';
const NOTES = notesRaw as [string, string, string[]][];

// 回答：○×は 1／0、4択は c の番号
type Ans = number | null;
// 4択の表示順（c の番号の並び）。○×は空
type Order = number[];
type Missed = { q: Item; your: Ans; order: Order };
type ReviewItem = { key: string; missed?: Missed };
type Screen =
  | { name: 'select' }
  | { name: 'home' }
  // field は宅建の分野別10問テスト
  | { name: 'exam'; qs: Item[]; orders: Order[]; round: number; field?: Q['f'] }
  | { name: 'result'; qs: Item[]; orders: Order[]; ans: Ans[]; score: number; round: number; used: number; setScores: number[] | null; field?: Q['f'] }
  | { name: 'lesson'; queue: ReviewItem[] }
  | { name: 'check'; item: ReviewItem; rest: ReviewItem[]; qs: Item[]; orders: Order[] }
  | { name: 'deep'; key: string; focus: number; missed?: Q; back: Screen; trail: string[] }
  // 計算方法・注意事項（ホームには載せない説明）
  | { name: 'notes'; sec: string; back?: Screen }
  // 過去問の4択に戻した一覧
  | { name: 'four' }
  // 英単語モード（画面は src/VocabScreens.tsx）
  | { name: 'vocab' };

const ordersFor = (x: Exam, qs: Item[]): Order[] => qs.map(q => (x.format === 'choice' ? choiceOrder(q) : []));
// 宅建だけの機能（合格の見込み・分野別10問・体系解説・1問ごとの即時採点など）を出すか
const isTakken = (x: Exam) => x.id === 'takken';

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const c = useColors();
  const st = useMemo(() => makeStyles(c), [c]);
  const [all, setAll] = useState<Partial<Record<ExamId, Progress>> | null>(null);
  const [vocab, setVocab] = useState<VocabProgress | null>(null);
  const [examId, setExamId] = useState<ExamId>(SINGLE?.id ?? 'takken');
  const [last, setLast] = useState<ExamId | null>(null);
  const [screen, setScreen] = useState<Screen>(SINGLE ? { name: 'home' } : { name: 'select' });
  const [unlocked, setUnlocked] = useState<Partial<Record<ExamId, boolean>>>({});
  const [store, setStore] = useState<Record<string, StoreState>>({});
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  // 体系ページで、押した項目の位置までスクロールする
  const scrollToNode = useCallback((node: View | null) => {
    if (!node || !contentRef.current) return;
    node.measureLayout(contentRef.current, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true }), () => {});
  }, []);

  const unlock = useCallback((id: ExamId, on = true) => {
    setUnlocked(u => ({ ...u, [id]: on }));
    saveUnlocked(id, on);
  }, []);

  useEffect(() => {
    Promise.all([
      Promise.all(APP_EXAMS.map(x => loadProgress(x))),
      Promise.all(APP_EXAMS.map(x => loadUnlocked(x.id))),
      loadLastExam(),
      loadVocab(),
    ]).then(([ps, us, l, v]) => {
      setVocab(v);
      setAll(Object.fromEntries(APP_EXAMS.map((x, i) => [x.id, ps[i]])));
      setUnlocked(Object.fromEntries(APP_EXAMS.map((x, i) => [x.id, us[i]])));
      setLast(l && APP_EXAMS.some(x => x.id === l) ? l : null);
    });
    // ストアに接続：価格の取得と購入済みの確認（購入・復元の結果もここに届く）
    const bySku: Record<string, ExamId> = Object.fromEntries(APP_EXAMS.map(x => [skuFor(x.id), x.id]));
    startStore(Object.keys(bySku).filter(Boolean), {
      onUnlocked: sku => { if (bySku[sku]) { unlock(bySku[sku]); setShopMsg('全問を解放しました。'); } },
      onError: m => setShopMsg(m),
    }).then(setStore);
  }, [unlock]);

  // 無料版は x を無料の問題だけの Exam にする（出題・復習・集計がすべて無料の範囲になる）
  const full = !!unlocked[examId];
  const x = full ? EXAM[examId] : freeExam(EXAM[examId]);
  const update = useCallback((next: Progress) => {
    setAll(a => (a ? { ...a, [examId]: next } : a));
    saveProgress(next, EXAM[examId]);
  }, [examId]);
  const go = useCallback((s: Screen) => {
    setScreen(s);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const toTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), []);
  const updateVocab = useCallback((next: VocabProgress) => { setVocab(next); saveVocab(next); }, []);
  const choose = useCallback((id: ExamId) => {
    setExamId(id);
    setLast(id);
    saveLastExam(id);
    go({ name: 'home' });
  }, [go]);

  if (!all || !vocab) {
    return <View style={[st.fill, st.center]}><ActivityIndicator color={c.ai} /></View>;
  }

  const shop: Shop = {
    full, total: EXAM[examId].items.length, msg: shopMsg,
    price: store[skuFor(examId)]?.price ?? PRICE_LABEL,
    buy: () => { setShopMsg(null); buy(skuFor(examId)).catch(e => setShopMsg(String(e?.message ?? e))); },
    restore: () => {
      setShopMsg(null);
      restore([skuFor(examId)], () => unlock(examId))
        .then(n => { if (!n) setShopMsg('この Apple ID での購入記録は見つかりませんでした。'); })
        .catch(e => setShopMsg(String(e?.message ?? e)));
    },
    devToggle: __DEV__ ? () => unlock(examId, !full) : undefined,
  };
  const ctx: Ctx = { c, st, x, p: all[examId] ?? emptyProgress(), update, go, scrollToNode, screen, shop };
  return (
    <SafeAreaView style={st.fill} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <ScrollView ref={scrollRef}>
        <View ref={contentRef} collapsable={false} style={st.wrap}>
        {screen.name === 'select' && <Select ctx={ctx} all={all} unlocked={unlocked} last={last} onChoose={choose} vocab={vocab} onVocab={() => go({ name: 'vocab' })} />}
        {screen.name === 'vocab' && <VocabApp ctx={{ c, st, p: vocab, update: updateVocab, exit: () => go({ name: 'select' }), toTop }} />}
        {screen.name === 'home' && <Home ctx={ctx} />}
        {screen.name === 'exam' && <ExamView ctx={ctx} s={screen} />}
        {screen.name === 'result' && <Result ctx={ctx} s={screen} />}
        {screen.name === 'lesson' && <LessonView ctx={ctx} queue={screen.queue} />}
        {screen.name === 'check' && <Check ctx={ctx} s={screen} />}
        {screen.name === 'deep' && <DeepView key={screen.key + screen.focus} ctx={ctx} s={screen} />}
        {screen.name === 'notes' && <NotesView ctx={ctx} sec={screen.sec} back={screen.back} />}
        {screen.name === 'four' && <FourView ctx={ctx} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type Ctx = {
  c: Colors; st: ReturnType<typeof makeStyles>; x: Exam; p: Progress;
  update: (p: Progress) => void; go: (s: Screen) => void;
  scrollToNode: (node: View | null) => void; screen: Screen; shop: Shop;
};
// 全問解放（買い切り）の状態と操作
type Shop = {
  full: boolean; total: number; price: string; msg: string | null;
  buy: () => void; restore: () => void; devToggle?: () => void;
};

/* ---------- 試験ごとの表示の小道具 ---------- */
const fieldName = (x: Exam, f: string) => x.fields.find(([k]) => k === f)?.[1] ?? f;
const kindName = (x: Exam, q: Item) => x.kinds?.find(([k]) => k === q.kind)?.[1];
const refLabel = (q: Item) => (q.ref === '確認' ? '確認問題' : q.ref);
const ansText = (q: Item, a: Ans) => (a == null ? '未回答' : q.c ? q.c[a] : a ? '○' : '×');
const groupLabel = (x: Exam, key: string) => {
  const [f, t] = key.split('|');
  return x.reviewBy === 'topic' ? t : fieldName(x, f);
};
const nextLabel = (x: Exam, p: Progress) => (x.rounds ? `第${p.set.round + 1}回へ進む` : 'もう1回（10問）');
const startExam = (ctx: Ctx) => {
  const { x, p, go } = ctx;
  const round = x.rounds ? p.set.round : 0;
  const qs = buildRound(x, p.hist, round, Math.random, p.set); // 5回のセットで論点が一巡するように
  go({ name: 'exam', qs, orders: ordersFor(x, qs), round });
};
// 宅建の分野別10問テストを始める
const startFieldExam = (ctx: Ctx, f: Q['f']) => {
  const { x, p, go } = ctx;
  // 無料版は無料の問題（x.items）の中から出す
  const qs = ctx.shop.full ? buildFieldExam(p.hist, f) : (pick(p.hist, x.items.filter(q => q.f === f), 10, new Set()) as Q[]);
  go({ name: 'exam', qs, orders: ordersFor(x, qs), round: 0, field: f });
};
// 復習を始める：解説（宅建）か間違えた問題があれば解説画面、なければ確認例題へ直接
const startReview = (ctx: Ctx, queue: ReviewItem[]) => {
  const { x, p, go } = ctx;
  const item = queue[0];
  if (item.missed || (x.reviewBy === 'topic' && LESSON[item.key])) { go({ name: 'lesson', queue }); return; }
  const qs = reviewQuestions(x, p.hist, item.key);
  go({ name: 'check', item, rest: queue.slice(1), qs, orders: ordersFor(x, qs) });
};

/* ---------- 共通部品 ---------- */
function Btn({ ctx, label, onPress, primary, disabled, selected, big, left }: {
  ctx: Ctx; label: string; onPress: () => void; primary?: boolean; disabled?: boolean; selected?: boolean; big?: boolean; left?: boolean;
}) {
  const { st } = ctx;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [st.btn, primary && st.btnPri, selected && st.btnSel, disabled && !selected && st.btnDis, big && st.btnBig, left && st.btnLeft, pressed && st.pressed]}
    >
      <Text style={[st.btnText, primary && st.btnPriText, selected && st.btnSelText, big && st.btnBigText, left && st.btnLeftText]}>{label}</Text>
    </Pressable>
  );
}
const Card = ({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) => <View style={ctx.st.card}>{children}</View>;

function JudgeTag({ ctx, tone, label }: { ctx: Ctx; tone: 'ok' | 'mid' | 'ng'; label: string }) {
  const { c, st } = ctx;
  const map = { ok: [c.ok, c.okSoft], mid: [c.warn, c.warnSoft], ng: [c.ng, c.ngSoft] } as const;
  const [fg, bg] = map[tone];
  return <Text style={[st.judge, { color: fg, backgroundColor: bg }]}>{label}</Text>;
}

// 問題文（本文があれば先に出す）
function Stem({ ctx, q }: { ctx: Ctx; q: Item }) {
  const { st } = ctx;
  return (
    <>
      {!!q.p && <View style={st.passage}><Text style={st.body}>{q.p}</Text></View>}
      <Text style={st.stmt}>{q.s}</Text>
    </>
  );
}

// 回答ボタン：○× は横に2つ、4択は表示順に縦に並べる
function AnswerPad({ ctx, q, order, value, locked, onAnswer }: {
  ctx: Ctx; q: Item; order: Order; value: Ans; locked?: boolean; onAnswer: (v: number) => void;
}) {
  const { st } = ctx;
  if (!q.c) {
    return (
      <View style={st.ox}>
        <View style={{ flex: 1 }}><Btn ctx={ctx} big label="○" disabled={locked} selected={value === 1} onPress={() => onAnswer(1)} /></View>
        <View style={{ flex: 1 }}><Btn ctx={ctx} big label="×" disabled={locked} selected={value === 0} onPress={() => onAnswer(0)} /></View>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {order.map((i, n) => (
        <Btn key={i} ctx={ctx} left label={`${n + 1}．${q.c![i]}`} disabled={locked} selected={value === i} onPress={() => onAnswer(i)} />
      ))}
    </View>
  );
}

function Explain({ ctx, q, your, ok }: { ctx: Ctx; q: Item; your?: Ans; ok: boolean }) {
  const { c, st } = ctx;
  return (
    <View style={[st.res, { backgroundColor: ok ? c.okSoft : c.ngSoft, borderLeftColor: ok ? c.ok : c.ng }]}>
      {q.c ? (
        <>
          <Text style={[st.resHead, { color: ok ? c.ok : c.ng }]}>{ok ? '正解' : '不正解'}</Text>
          <Text style={st.body}>答え：<Text style={st.bold}>{q.c[q.a]}</Text></Text>
          {your !== undefined && !ok && <Text style={st.body}>あなた：{ansText(q, your)}</Text>}
        </>
      ) : (
        <Text style={[st.resHead, { color: ok ? c.ok : c.ng }]}>
          {ok ? '正解' : '不正解'}
          {your !== undefined ? `　あなた：${ansText(q, your)}` : ''}
          {`　答え：${ansText(q, q.a)}`}
        </Text>
      )}
      <Text style={st.body}>{q.e}</Text>
      {!!q.m && <Text style={st.memo}>覚え方：<Text style={st.bold}>{q.m}</Text></Text>}
    </View>
  );
}

function Footer({ ctx }: { ctx: Ctx }) {
  return (
    <Text style={ctx.st.note}>
      本アプリは個人学習用の非公式教材で、試験の実施機関・各大学とは関係ありません。法令や入試の内容は変わることがあるため、最新の情報は公式資料で確認してください。
    </Text>
  );
}

/* ---------- 入口：試験を選ぶ ---------- */
function Select({ ctx, all, unlocked, last, onChoose, vocab, onVocab }: {
  ctx: Ctx; all: Partial<Record<ExamId, Progress>>; unlocked: Partial<Record<ExamId, boolean>>; last: ExamId | null; onChoose: (id: ExamId) => void; vocab: VocabProgress; onVocab: () => void;
}) {
  const { st } = ctx;
  const groups = [...new Set(APP_EXAMS.map(x => x.group))];
  const vLearned = VOCAB_LEVELS.reduce((a, L) => a + vocabLevelOf(vocab, L.id).learned, 0);
  const vRounds = VOCAB_LEVELS.reduce((a, L) => a + vocabStats(L, vocabLevelOf(vocab, L.id)).rounds, 0);
  const vBest = Math.max(0, ...VOCAB_LEVELS.map(L => vocabStats(L, vocabLevelOf(vocab, L.id)).best));
  const vDue = VOCAB_LEVELS.some(L => vocabFixDue(vocabLevelOf(vocab, L.id)));
  return (
    <>
      <View style={{ gap: 4 }}>
        <Text style={st.h1}>10分模試</Text>
        <Text style={st.sub}>10問を10分。間違えたところはその場で解説と確認例題で復習します。試験を選んでください。</Text>
      </View>
      {groups.map(g => (
        <View key={g} style={{ gap: 10 }}>
          <Text style={st.h3}>{g}</Text>
          {APP_EXAMS.filter(x => x.group === g).map(x => {
            const hist = all[x.id]?.hist ?? {};
            const done = Object.keys(hist).length;
            let n = 0, cc = 0;
            Object.values(hist).forEach(h => { n += h.n; cc += h.c; });
            return (
              <Pressable key={x.id} accessibilityRole="button" onPress={() => onChoose(x.id)}
                style={({ pressed }) => [st.card, x.id === last && st.cardNow, pressed && st.pressed]}>
                <View style={st.rowBetween}>
                  <Text style={st.h2}>{x.name}</Text>
                  <View style={st.row}>
                    {x.id === last && <Text style={st.tag}>前回</Text>}
                    {!unlocked[x.id] && <Text style={st.tag}>無料版</Text>}
                  </View>
                </View>
                <Text style={st.note}>{x.desc}</Text>
                <Text style={st.note}>
                  {x.format === 'ox' ? '○×' : '4択'}・全{x.items.length}問
                  {done ? `　解いた ${done}問・正答率 ${Math.round((cc / n) * 100)}%` : '　まだ解いていません'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ gap: 10 }}>
        <Text style={st.h3}>英単語</Text>
        <Pressable accessibilityRole="button" onPress={onVocab} style={({ pressed }) => [st.card, pressed && st.pressed]}>
          <View style={st.rowBetween}>
            <Text style={st.h2}>英単語フラッシュ</Text>
            {vDue && <Text style={st.tag}>定着テスト</Text>}
          </View>
          <Text style={st.note}>30語を1分で覚えて1分でテスト。正解で+0.5秒、得点＝残り秒＋正解数。300語ごとに間違えた語だけで定着テスト。</Text>
          <Text style={st.note}>
            {VOCAB_LEVELS.map(L => L.name.replace('TOEIC ', '')).join('・')}（TOEIC目安）　各300語
            {vRounds ? `　覚えた ${vLearned}語・${vRounds}回・最高 ${vBest}点` : '　まだ始めていません'}
          </Text>
        </Pressable>
      </View>
      <Footer ctx={ctx} />
    </>
  );
}

/* ---------- ホーム ---------- */
function Home({ ctx }: { ctx: Ctx }) {
  const { c, st, x, p, update, go } = ctx;
  const [confirm, setConfirm] = useState(false);
  const hist = p.hist;
  const done = x.items.filter(q => hist[q.k]).length; // 無料版は無料の範囲で数える
  let tn = 0, tc = 0;
  Object.values(hist).forEach(h => { tn += h.n; tc += h.c; });
  const rate = tn ? Math.round((tc / tn) * 100) : null;
  const R = x.rounds?.length ?? 0;
  const r = p.set.round;
  const setTotal = p.set.scores.reduce((a, b) => a + (b || 0), 0);
  // 宅建は topicStats(hist, p.r10) と同じ（論点ごと・直近10問つき）
  const ts = x.reviewBy === 'topic' ? statsBy(x, hist, p.r10) : fieldStatsBy(x, hist, p.r10);
  const weak = ts.filter(s => topicState(s) === 1);
  const tk = isTakken(x);
  const stateColor = [c.line, c.ng, c.warn, c.ok];
  const stateBg = [c.paper, c.ngSoft, c.warnSoft, c.okSoft];
  const unit = x.reviewBy === 'topic' ? '論点' : '分野';
  // 宅建以外：習熟度（topicState）で色分け
  const chip = (s: (typeof ts)[number], key: string) => {
    const k = topicState(s);
    return (
      <Pressable key={key} onPress={() => startReview(ctx, [{ key }])}
        style={({ pressed }) => [st.chip, { borderColor: stateColor[k], backgroundColor: stateBg[k] }, pressed && st.pressed]}>
        <Text style={st.chipText}>{s.t}{s.n ? ` ${Math.round((s.c / s.n) * 100)}%` : ''}</Text>
      </Pressable>
    );
  };
  return (
    <>
      {!SINGLE && <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="‹ 試験を選ぶ" onPress={() => go({ name: 'select' })} /></View>}
      <View style={{ gap: 4 }}>
        <Text style={st.h1}>{x.name}</Text>
        <Text style={st.sub}>
          {x.rounds
            ? `本試験と同じ分野比率で10問を10分。${R}回で${R * x.size}問＝1回分の本試験です。`
            : `${x.desc}出題は未出題・前回間違えた問題が優先です。`}
        </Text>
      </View>

      <Card ctx={ctx}>
        {x.rounds ? (
          <>
            <View style={st.rowBetween}>
              <Text style={st.h2}>第{r + 1}回 / {R}回</Text>
              <Text style={st.note}>{p.set.scores.length ? `ここまで ${setTotal} / ${p.set.scores.length * x.size}点` : 'まだ解いていません'}</Text>
            </View>
            <View style={st.slots}>
              {x.rounds.map((m, k) => (
                <View key={k} style={[st.slot, k === r && st.slotNow]}>
                  <Text style={st.slotText}>第{k + 1}回</Text>
                  <Text style={st.slotScore}>{p.set.scores[k] != null ? `${p.set.scores[k]}点` : '—'}</Text>
                  <Text style={st.slotMix}>
                    {x.fields.map(([f], i) => `${i === 2 ? '\n' : ''}${f[0]}${m[f]}`).join('')}
                  </Text>
                </View>
              ))}
            </View>
            <Btn ctx={ctx} primary label={`第${r + 1}回を始める（${x.size}問・${x.limit / 60}分）`} onPress={() => startExam(ctx)} />
          </>
        ) : (
          <Btn ctx={ctx} primary label={`模試を始める（${x.size}問・${x.limit / 60}分）`} onPress={() => startExam(ctx)} />
        )}
        <Text style={st.note}>
          目安：10問中 8問以上で合格圏、7問は合格ライン上。{x.rounds ? '5回合計で35点が7割、37点以上なら安全圏です。' : ''}
        </Text>
      </Card>

      {!ctx.shop.full && <Unlock ctx={ctx} done={done} />}

      {tk && <PassCard ctx={ctx} />}

      {tk && <Card ctx={ctx}>
        <Text style={st.h2}>分野別10問テスト</Text>
        <Text style={st.note}>1つの分野だけを10問・10分。まだ解いていない問題と前回間違えた問題を優先します。5回セットの記録には入りません。</Text>
        <View style={st.wrapRow}>
          {(() => { const fs = fieldStatsOf(hist); return FIELDS.map(([f, n]) => (
            <Pressable key={f} onPress={() => startFieldExam(ctx, f)}
              style={({ pressed }) => [st.kpi, { flexBasis: '47%' }, pressed && st.pressed]}>
              <Text style={st.bold}>{n}</Text>
              <Text style={st.note}>{fs[f].n ? `${Math.round((fs[f].c / fs[f].n) * 100)}%` : '未着手'}　{fs[f].q}/{fs[f].tot}問</Text>
            </Pressable>
          )); })()}
        </View>
      </Card>}

      <Card ctx={ctx}>
        <Text style={st.h2}>今の実力</Text>
        <View style={st.kpis}>
          <Kpi ctx={ctx} label="正答率" value={rate == null ? '—' : `${rate}%`} />
          <Kpi ctx={ctx} label="解いた問題" value={`${done} / ${x.items.length}`} />
          {x.fields.map(([f, n]) => {
            let a = 0, cc = 0;
            x.items.forEach(q => { if (q.f === f) { const h = hist[q.k]; if (h) { a += h.n; cc += h.c; } } });
            return <Kpi key={f} ctx={ctx} label={n} value={a ? `${Math.round((cc / a) * 100)}%` : '—'} />;
          })}
        </View>
        {weak.length > 0 && (
          <Btn ctx={ctx} label={`要復習の${unit}（${weak.length}件）を${x.reviewBy === 'topic' ? '解説から' : '確認例題で'}復習`}
            onPress={() => startReview(ctx, weak.map(s => ({ key: x.reviewBy === 'topic' ? `${s.f}|${s.t}` : `${s.f}|` })))} />
        )}
      </Card>

      {p.log.length > 0 && (
        <Card ctx={ctx}>
          <Text style={st.h2}>模試の履歴</Text>
          {p.log.slice(-10).reverse().map(l => (
            <View key={l.at} style={st.histRow}>
              <Text style={st.note}>{l.at.slice(5, 10).replace('-', '/')} {l.at.slice(11, 16)}</Text>
              {l.field ? <Text style={st.note}>{fieldName(x, l.field)}</Text> : !!x.rounds && <Text style={st.note}>第{l.round}回</Text>}
              <Text style={st.bold}>{l.score} / {l.field ? 10 : x.size}</Text>
              <Text style={st.note}>{Math.floor(l.sec / 60)}分{l.sec % 60}秒</Text>
            </View>
          ))}
        </Card>
      )}

      <Card ctx={ctx}>
        <Text style={st.h2}>{unit}マップ</Text>
        <Text style={st.note}>
          {tk
            ? `タイルを押すと、その論点の解説と確認例題${reviewCount(x)}問。直近10問の正答率が上がるほど緑が濃くなります。全部の論点を緑にしましょう。`
            : `押すと、その${unit}の${x.reviewBy === 'topic' ? '解説と' : ''}確認例題${reviewCount(x)}問。赤＝要復習／黄＝習得中／緑＝習得／無色＝未着手`}
        </Text>
        {tk
          ? <TileMap ctx={ctx} />
          : x.reviewBy === 'topic'
            ? x.fields.map(([f, n]) => (
              <View key={f} style={{ gap: 6 }}>
                <Text style={st.h3}>{n}</Text>
                <View style={st.wrapRow}>{ts.filter(s => s.f === f).map(s => chip(s, `${s.f}|${s.t}`))}</View>
              </View>
            ))
            : <View style={st.wrapRow}>{ts.map(s => chip(s, `${s.f}|`))}</View>}
      </Card>

      {tk && <FourRow ctx={ctx} />}

      <Card ctx={ctx}>
        <View style={st.wrapRow}>
          {!!x.rounds && <Btn ctx={ctx} label="セットを第1回からやり直す" onPress={() => update({ ...p, set: { round: 0, scores: [] } })} />}
          <Btn ctx={ctx} label="学習記録をすべて消す" onPress={() => setConfirm(true)} />
        </View>
        {confirm && (
          <View style={st.confirm}>
            <Text style={st.body}>{x.name}の解いた記録と正答率がすべて消えます。</Text>
            <View style={st.wrapRow}>
              <Btn ctx={ctx} label="消す" onPress={() => { update(emptyProgress()); setConfirm(false); }} />
              <Btn ctx={ctx} label="やめる" onPress={() => setConfirm(false)} />
            </View>
          </View>
        )}
        <Text style={st.note}>
          学習記録はこの端末に試験ごとに保存されます。
          {x.format === 'ox' ? '問題は各論点を○×形式で確認するもので、出典は「年度-問-肢」で表示します。' : '選択肢の順番は毎回入れ替わります。'}
          {x.kinds ? `問題は「${x.kinds.map(k => k[1]).join('」と「')}」の2種類です。` : ''}
        </Text>
        <View style={st.wrapRow}>
          {ctx.shop.full ? <Text style={st.note}>全{ctx.shop.total}問を解放済みです。</Text> : <Btn ctx={ctx} label="購入を復元" onPress={ctx.shop.restore} />}
          {ctx.shop.devToggle && <Btn ctx={ctx} label={`開発用：${ctx.shop.full ? '無料版に戻す' : '解放する'}`} onPress={ctx.shop.devToggle} />}
        </View>
        <Footer ctx={ctx} />
      </Card>
    </>
  );
}

// 無料版の案内と購入
function Unlock({ ctx, done }: { ctx: Ctx; done: number }) {
  const { c, st, x, shop } = ctx;
  const allDone = x.items.every(q => ctx.p.hist[q.k]);
  return (
    <View style={[st.card, { borderColor: c.ai }]}>
      <Text style={st.h2}>無料版：全{shop.total}問のうち{x.items.length}問</Text>
      <Text style={st.body}>
        {allDone ? '無料の問題はすべて解きました。' : `各分野から10問に1問を無料で解けます（解いた問題 ${done}問）。`}
        {shop.price}（買い切り）で全{shop.total}問を解放できます。学習記録はそのまま引き継がれます。
      </Text>
      <Btn ctx={ctx} primary label={`全${shop.total}問を解放する（${shop.price}）`} onPress={shop.buy} />
      <Btn ctx={ctx} label="購入を復元" onPress={shop.restore} />
      {!!shop.msg && <Text style={st.note}>{shop.msg}</Text>}
    </View>
  );
}
// 宅建の論点マップ：分野ごとに4列の正方形タイル。直近10問の正答率が上がるほど緑が濃くなる
function TileMap({ ctx }: { ctx: Ctx }) {
  const { c, st, x, p, go } = ctx;
  const all = useMemo(() => statsBy(EXAM[x.id], p.hist, p.r10), [x.id, p.hist, p.r10]);
  // 論点ごとの「収録数・解いた問題数・正解している問題数（最後に解いたときに正解）」
  const cnt = useMemo(() => {
    const m: Record<string, { done: number; ok: number }> = {};
    EXAM[x.id].items.forEach(q => {
      const h = p.hist[q.k]; if (!h) return;
      const o = (m[q.f + '|' + q.t] = m[q.f + '|' + q.t] || { done: 0, ok: 0 });
      o.done++; if (h.last === 1) o.ok++;
    });
    return m;
  }, [x.id, p.hist]);
  const look = (s: (typeof all)[number]) => {
    const { tier, few } = topicTier(s);
    const L: Record<Tier, { bg: string; fg: string; bd: string }> = {
      none: { bg: c.paper, fg: c.muted, bd: c.line },
      bad: { bg: c.ngSoft, fg: c.ng, bd: c.ng },
      low: { bg: c.orSoft, fg: c.or, bd: c.or },
      mid: { bg: mix(c.ok, c.paper, 0.8), fg: c.ok, bd: c.ok },
      good: { bg: mix(c.ok, c.paper, 0.22), fg: c.onAi, bd: c.ok },
      perfect: { bg: c.ok, fg: c.onAi, bd: c.ok },
    };
    const b = L[tier];
    const soft = few && tier !== 'none';
    return { tier, few, bg: soft ? mix(b.bg, c.paper, 0.45) : b.bg, fg: soft && (tier === 'good' || tier === 'perfect') ? c.ok : b.fg, bd: b.bd };
  };
  const green = (s: (typeof all)[number]) => { const { tier, few } = topicTier(s); return !few && (tier === 'good' || tier === 'perfect'); };
  const g = all.filter(green).length;
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <View style={st.rowBetween}>
          <Text style={st.bold}>緑のタイル</Text>
          <Text style={[st.kpiVal, { color: c.ok }]}>{g}<Text style={st.note}> / {all.length}論点</Text></Text>
        </View>
        <View style={st.tileBar}><View style={[st.tileBarFill, { width: `${(g / Math.max(1, all.length)) * 100}%` }]} /></View>
      </View>
      {x.fields.map(([f, name]) => {
        const ts = all.filter(s => s.f === f);
        const fg = ts.filter(green).length;
        const pad = (4 - (ts.length % 4)) % 4;
        return (
          <View key={f} style={{ gap: 8 }}>
            <View style={st.rowBetween}>
              <Text style={st.h3}>{name}</Text>
              <View style={st.row}>
                {fg === ts.length && <Text style={st.tileDone}>制覇</Text>}
                <Text style={[st.note, { color: fg ? c.ok : c.muted }]}>緑 {fg}/{ts.length}</Text>
              </View>
            </View>
            <View style={st.tiles}>
              {ts.map(s => {
                const v = look(s);
                const pct = s.rn ? Math.round((s.rc / s.rn) * 100) : null;
                const k = cnt[`${s.f}|${s.t}`] || { done: 0, ok: 0 };
                return (
                  <Pressable key={s.t} accessibilityRole="button" accessibilityLabel={`${s.t} 全${s.total}問中${k.done}問解答・${k.ok}問正解${pct == null ? '' : `・直近正答率${pct}%`}`}
                    onPress={() => go({ name: 'lesson', queue: [{ key: `${s.f}|${s.t}` }] })}
                    style={({ pressed }) => [st.tile, { backgroundColor: v.bg, borderColor: v.bd, borderStyle: v.tier === 'none' || v.few ? 'dashed' : 'solid' }, pressed && st.pressed]}>
                    <Text style={[st.tileName, { color: v.tier === 'none' ? c.ink : v.fg }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>{v.tier === 'perfect' && !v.few ? '★' : ''}{s.t}</Text>
                    <View>
                      <Text style={[st.tileNum, { color: v.tier === 'none' ? c.muted : v.fg }]} numberOfLines={1} adjustsFontSizeToFit>{k.done}<Text style={st.tileNumS}>/{s.total}問</Text></Text>
                      <Text style={[st.tileNum, { color: v.tier === 'none' ? c.muted : v.fg }]} numberOfLines={1} adjustsFontSizeToFit><Text style={st.tileNumS}>正解 </Text>{k.ok}<Text style={st.tileNumS}>問</Text></Text>
                    </View>
                  </Pressable>
                );
              })}
              {Array.from({ length: pad }, (_, i) => <View key={`pad${i}`} style={[st.tile, { opacity: 0 }]} />)}
            </View>
          </View>
        );
      })}
      <Text style={st.note}>タイルの数字：上＝解いた問題数／その論点の収録数、下＝正解している問題数（最後に解いたときに正解したもの）。色の目安（直近10問の正答率）：灰＝未着手／赤＝40%未満／橙＝40〜59%／薄い緑＝60〜79%／緑＝80%以上／濃い緑★＝100%。点線は解いた数が5問未満（参考値）。80%以上（5問以上）で「緑」に数えます。</Text>
    </View>
  );
}
function Kpi({ ctx, label, value }: { ctx: Ctx; label: string; value: string }) {
  return (
    <View style={ctx.st.kpi}>
      <Text style={ctx.st.note}>{label}</Text>
      <Text style={ctx.st.kpiVal}>{value}</Text>
    </View>
  );
}

/* ---------- 合格の見込み ---------- */
const fieldStatsOf = (h: Progress['hist']) => fieldStats(h);
function PassCard({ ctx }: { ctx: Ctx }) {
  const { c, st, p, go } = ctx;
  const P = useMemo(() => passEstimate(p.hist, 3000, p.r10), [p.hist, p.r10]);
  if (!P.ready) {
    return (
      <Card ctx={ctx}>
        <Text style={st.h2}>合格の見込み</Text>
        <Text style={st.note}>あと {30 - P.total}問 解くと判定します（30問以上の回答で表示）。</Text>
        <View style={st.barBg}><View style={[st.barFg, { width: `${Math.round((P.total / 30) * 100)}%` }]} /></View>
      </Card>
    );
  }
  const pct = Math.round(P.prob * 100);
  const j = pct >= 80 ? { tone: 'ok' as const, label: '合格圏' } : pct >= 50 ? { tone: 'mid' as const, label: '合格ライン付近' } : { tone: 'ng' as const, label: '要強化' };
  return (
    <Card ctx={ctx}>
      <Text style={st.h2}>合格の見込み</Text>
      <View style={st.row}>
        <Text style={st.big}>{pct}<Text style={st.bigUnit}>%</Text></Text>
        <JudgeTag ctx={ctx} {...j} />
      </View>
      <Text style={st.body}>直近の○×正答率 {Math.round(P.ox * 100)}% → 過去平均で補正して <Text style={st.bold}>{Math.round(P.oxAdj * 100)}%</Text>（全体 {Math.round(P.oxAll * 100)}%） → 推定4択正答率 <Text style={st.bold}>{Math.round(P.four * 100)}%</Text> → 予想得点 <Text style={st.bold}>{Math.round(P.mean)}点</Text> / 50（8割の確率で {P.lo}〜{P.hi}点）</Text>
      {(() => { const b = P.limbs; const r = (x: number) => `${Math.round(x * 100)}%`; return (
        <Text style={st.note}>4択1問あたり：4肢中 <Text style={st.bold}>3つ以上分かる {r(b[3])}</Text>（正解確定）／2つ {r(b[2])}（1/2）／1つ {r(b[1])}（1/3）／1つも分からない {r(b[0])}（1/4）</Text>); })()}
      <View style={st.kpis}>
        {PASS_LINES.filter((_, i) => i % 2 === 0).map(t => (
          <Kpi key={t} ctx={ctx} label={`合格点${t}点の年`} value={`${Math.round(P.byLine[PASS_LINES.indexOf(t)] * 100)}%`} />
        ))}
      </View>
      <View style={st.tblWrap}>
        <View style={[st.tblRow, { backgroundColor: c.aiSoft }]}>
          {['4択での解き方', '4択', '予想点', '合格率'].map((h, i) => <Text key={h} style={[st.tblCell, st.tblHead, i === 0 && { flex: 2.2 }]}>{h}</Text>)}
        </View>
        {P.scen.map((x, i) => (
          <View key={x.k} style={[st.tblRow, i === 1 && { backgroundColor: c.warnSoft }]}>
            <Text style={[st.tblCell, { flex: 2.2 }]}>{x.label}</Text>
            <Text style={st.tblCell}>{Math.round(x.four * 100)}%</Text>
            <Text style={st.tblCell}>{Math.round(x.mean)}点</Text>
            <Text style={[st.tblCell, st.tblHead]}>{Math.round(x.prob * 100)}%</Text>
          </View>
        ))}
      </View>
      {FIELDS.map(([f, n]) => {
        const s = P.st[f]; const e = P.exp[f];
        return (
          <View key={f} style={[st.passRow, f === P.focus && { backgroundColor: c.warnSoft }]}>
            <Text style={[st.bold, { width: 92 }]}>{n}</Text>
            <View style={{ width: 52 }}>
              <Text style={st.bold}>{Math.round(P.adj[f].adj * 100)}%</Text>
              {!!s.rn && <Text style={[st.note, { fontSize: 10 }]}>直近{Math.round((s.rc / s.rn) * 100)}%</Text>}
            </View>
            <Text style={[st.note, { width: 40 }]}>{s.n ? `${Math.round((s.c / s.n) * 100)}%` : '—'}</Text>
            <Text style={[st.note, { width: 40 }]}>{Math.round((e / EXAM_N[f]) * 100)}%</Text>
            <Text style={[st.note, { width: 64 }]}>{e.toFixed(1)}/{EXAM_N[f]}</Text>
            <View style={[st.barBg, { flex: 1 }]}><View style={[st.barFg, { width: `${Math.round((e / EXAM_N[f]) * 100)}%` }]} /></View>
          </View>
        );
      })}
      <Btn ctx={ctx} primary label={`いちばん伸ばせる「${fieldName(ctx.x, P.focus)}」の10問テスト`}
        onPress={() => startFieldExam(ctx, P.focus)} />
      <NotesLink ctx={ctx} sec="pass" lead="目安です（合格を保証するものではありません）。" />
    </Card>
  );
}

/* 過去問の4択に戻す：肢をまとめ直し、元の4択1問の正解率を推計 */
// ホーム下部の1行：押すと詳しい画面（FourView）
function FourRow({ ctx }: { ctx: Ctx }) {
  const { c, st, p, go } = ctx;
  const F = useMemo(() => fourChoice(p.hist, p.r10), [p.hist, p.r10]);
  return (
    <Pressable accessibilityRole="button" onPress={() => go({ name: 'four' })}
      style={({ pressed }) => [st.card, st.rowBetween, { paddingVertical: 12 }, pressed && st.pressed]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={st.bold}>過去問の4択に戻すと</Text>
        <Text style={st.note}>{F.n ? `推計できた4択 ${F.n}/${F.total}問` : '○×を解くと、元の4択での正解率を推計します'}</Text>
      </View>
      {!!F.n && <Text style={[st.kpiVal, { color: F.avg >= 0.7 ? c.ok : F.avg >= 0.4 ? c.warn : c.ng }]}>{Math.round(F.avg * 100)}%</Text>}
      <Text style={[st.note, { fontSize: 20 }]}>›</Text>
    </Pressable>
  );
}
function FourView({ ctx }: { ctx: Ctx }) {
  const { c, st, p, go } = ctx;
  const F = useMemo(() => fourChoice(p.hist, p.r10), [p.hist, p.r10]);
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  const tone = (x: number) => (x >= 0.7 ? c.ok : x >= 0.4 ? c.warn : c.ng);
  return (
    <>
      <View style={st.rowBetween}>
        <Text style={st.h2}>過去問の4択に戻すと</Text>
        <Btn ctx={ctx} label="← 戻る" onPress={() => go({ name: 'home' })} />
      </View>
      <Card ctx={ctx}>
        <View style={st.kpis}>
          <Kpi ctx={ctx} label="推計できた4択" value={`${F.n}/${F.total}問`} />
          <Kpi ctx={ctx} label="平均の正解率" value={pc(F.avg)} />
          <Kpi ctx={ctx} label={`3肢以上解いた${F.nSolid}問`} value={F.avgSolid == null ? '—' : pc(F.avgSolid)} />
        </View>
        <NotesLink ctx={ctx} sec="four" back={{ name: 'four' }} lead="正解率の低い順。論点名を押すと解説と確認例題へ。肢の色：緑＝正解／赤＝誤り／?＝データにない肢。" />
      {F.items.map(x => {
        const w = x.limbs.reduce((a, l) => (l.p < a.p ? l : a));
        return (
          <Pressable key={x.id} onPress={() => go({ name: 'lesson', queue: [{ key: `${w.q.f}|${w.q.t}` }] })}
            style={({ pressed }) => [st.passRow, { alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8 }, pressed && st.pressed]}>
            <View style={{ width: 118 }}>
              <Text style={[st.big, { fontSize: 22, color: tone(x.prob) }]}>{pc(x.prob)}</Text>
              <Text style={st.bold}>{x.label}</Text>
              <Text style={st.note}>{fieldName(ctx.x, x.f)}{x.kind === 'count' ? '・個数/組合せ' : ''}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[st.body, { color: c.ai, textDecorationLine: 'underline' }]}>{[...new Set(x.limbs.map(l => l.q.t))].join('・')}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {x.limbs.map(l => {
                  const col = l.n ? (l.c / l.n >= 0.5 ? c.ok : c.ng) : c.line;
                  const bg = l.n ? (l.c / l.n >= 0.5 ? c.okSoft : c.ngSoft) : c.paper;
                  return <Text key={l.label} style={{ minWidth: 22, textAlign: 'center', fontSize: 12, borderWidth: 1, borderRadius: 4, borderColor: col, backgroundColor: bg, color: l.n ? col : c.muted }}>{l.label}</Text>;
                })}
                {Array.from({ length: x.missing }, (_, i) => <Text key={`m${i}`} style={{ minWidth: 22, textAlign: 'center', fontSize: 12, borderWidth: 1, borderRadius: 4, borderStyle: 'dashed', borderColor: c.line, color: c.muted }}>?</Text>)}
              </View>
              <Text style={st.note}>{x.answered}/4肢 解答済み</Text>
            </View>
          </Pressable>
        );
      })}
      </Card>
      <Btn ctx={ctx} label="← 戻る" onPress={() => go({ name: 'home' })} />
    </>
  );
}

/* ---------- 試験 ---------- */
function ExamView({ ctx, s }: { ctx: Ctx; s: Extract<Screen, { name: 'exam' }> }) {
  const { c, st, x, p, update, go } = ctx;
  const { qs, orders, round, field } = s;
  // 宅建は1問ごとにその場で正誤と解説を表示（10問テスト・分野別とも）。他の試験は採点まで正誤を出さない
  const instant = isTakken(x);
  const [ans, setAns] = useState<Ans[]>(() => qs.map(() => null));
  const [cur, setCur] = useState(0);
  const [left, setLeft] = useState(x.limit);
  const [ask, setAsk] = useState(false);
  const start = useRef(Date.now());
  const finished = useRef(false);
  const ansRef = useRef(ans);
  ansRef.current = ans;

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const used = Math.min(x.limit, Math.round((Date.now() - start.current) / 1000));
    if (field) {
      const r = finishFieldExam(p, field, qs as Q[], ansRef.current as (0 | 1 | null)[], used);
      update(r.next);
      go({ name: 'result', qs, orders, ans: ansRef.current, score: r.score, round: 0, used, setScores: null, field });
      return;
    }
    const r = finishRound(x, p, qs, ansRef.current, used);
    update(r.next);
    go({ name: 'result', qs, orders, ans: ansRef.current, score: r.score, round: r.round, used, setScores: r.setScores });
  }, [x, p, qs, orders, update, go, field]);

  // 経過時間は開始時刻から計算（バックグラウンドに行ってもずれない）
  useEffect(() => {
    const id = setInterval(() => {
      const l = x.limit - Math.floor((Date.now() - start.current) / 1000);
      setLeft(Math.max(0, l));
      if (l <= 0) { clearInterval(id); finish(); }
    }, 500);
    return () => clearInterval(id);
  }, [x, finish]);

  const q = qs[cur];
  const choose = (v: number) => {
    if (instant) {
      // 1問ごとにその場で正誤と解説を表示（答えは確定）。10問テスト・分野別とも同じ
      if (ans[cur] != null) return;
      const ok = v === qs[cur].a;
      Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
      const next = [...ans]; next[cur] = v; setAns(next);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    const next = [...ans]; next[cur] = v; setAns(next);
    if (cur < qs.length - 1) setCur(cur + 1);
  };
  const locked = instant && ans[cur] != null;
  const tryFinish = () => { if (ans.some(a => a == null)) setAsk(true); else finish(); };
  const un = ans.filter(a => a == null).length;
  const kind = kindName(x, q);

  return (
    <>
      <View style={st.rowBetween}>
        <View>
          <Text style={st.note}>{field ? `${fieldName(x, field)} 10問　` : x.rounds ? `第${round + 1}回　` : ''}{qs.length - un}/{qs.length}問 回答済み</Text>
          <Text style={[st.timer, left <= 60 && { color: c.ng }]}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text>
        </View>
        <Btn ctx={ctx} label="採点する" onPress={tryFinish} />
      </View>
      <View style={st.dots}>
        {qs.map((_, k) => (
          <Pressable key={k} onPress={() => setCur(k)} accessibilityLabel={`${k + 1}問目`}
            style={[st.dot, ans[k] != null && (!instant ? { backgroundColor: c.aiSoft, borderColor: c.ai } : ans[k] === qs[k].a ? { backgroundColor: c.okSoft, borderColor: c.ok } : { backgroundColor: c.ngSoft, borderColor: c.ng }), k === cur && { borderColor: c.ink, borderWidth: 2 }]}>
            <Text style={st.dotText}>{k + 1}</Text>
          </Pressable>
        ))}
      </View>
      {ask && (
        <View style={st.confirm}>
          <Text style={st.body}>未回答が{un}問あります。未回答は不正解になります。</Text>
          <View style={st.wrapRow}>
            <Btn ctx={ctx} primary label="採点する" onPress={finish} />
            <Btn ctx={ctx} label="続ける" onPress={() => setAsk(false)} />
          </View>
        </View>
      )}
      <Card ctx={ctx}>
        <Text style={st.meta}>問{cur + 1}　{fieldName(x, q.f)}{kind ? `　${kind}` : ''}</Text>
        <Stem ctx={ctx} q={q} />
        <AnswerPad ctx={ctx} q={q} order={orders[cur]} value={ans[cur]} locked={locked} onAnswer={choose} />
        {locked && <Explain ctx={ctx} q={q} ok={ans[cur] === q.a} />}
        <View style={st.rowBetween}>
          <Btn ctx={ctx} label="前へ" disabled={cur === 0} onPress={() => setCur(cur - 1)} />
          <Btn ctx={ctx} primary={locked} label={cur < qs.length - 1 ? '次へ' : '採点する'} onPress={() => (cur < qs.length - 1 ? setCur(cur + 1) : tryFinish())} />
        </View>
      </Card>
    </>
  );
}

/* ---------- 結果 ---------- */
function Result({ ctx, s }: { ctx: Ctx; s: Extract<Screen, { name: 'result' }> }) {
  const { st, x, p, go } = ctx;
  const j = judge(s.score);
  const wrong = wrongGroups(x, s.qs, s.ans).map(w => ({
    key: w.key, missed: { ...w.missed, order: s.orders[s.qs.indexOf(w.missed.q)] },
  }));
  const tot = s.setScores ? s.setScores.reduce((a, b) => a + b, 0) : 0;
  const sj = judgeSet(tot);
  const unit = x.reviewBy === 'topic' ? '論点' : '分野';
  return (
    <>
      <Card ctx={ctx}>
        <Text style={st.h2}>{s.field ? `${fieldName(x, s.field)} 10問の結果` : x.rounds ? `第${s.round + 1}回の結果` : '結果'}</Text>
        <View style={st.row}>
          <Text style={st.big}>{s.score}<Text style={st.bigUnit}> / {s.qs.length}</Text></Text>
          <JudgeTag ctx={ctx} {...j} />
        </View>
        <Text style={st.note}>かかった時間 {Math.floor(s.used / 60)}分{s.used % 60}秒 / {x.limit / 60}分</Text>
        {wrong.length ? (
          <>
            <Text style={st.note}>
              {x.reviewBy === 'topic'
                ? '間違えた論点ごとに「解説（具体例・周辺知識つき） → 付随する論点 → 確認例題5問」の順で復習します。'
                : '間違えた分野ごとに「間違えた問題の解説 → 同じ分野の確認例題3問」の順で復習します。'}
            </Text>
            <Btn ctx={ctx} primary label={`間違えた${wrong.length}${unit}を復習する`} onPress={() => startReview(ctx, wrong)} />
            <View style={st.wrapRow}>
              {wrong.map(w => <Btn key={w.key} ctx={ctx} label={`${groupLabel(x, w.key)}だけ`} onPress={() => startReview(ctx, [w])} />)}
            </View>
          </>
        ) : <Text style={st.body}>全問正解です。次の回に進みましょう。</Text>}
        <View style={st.wrapRow}>
          <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
          {s.field
            ? <Btn ctx={ctx} label={`もう一度 ${fieldName(x, s.field)} 10問`} onPress={() => startFieldExam(ctx, s.field!)} />
            : <Btn ctx={ctx} label={nextLabel(x, p)} onPress={() => startExam(ctx)} />}
        </View>
      </Card>
      {s.setScores && (
        <Card ctx={ctx}>
          <Text style={st.h2}>{s.setScores.length}回セットの合計（本試験1回分）</Text>
          <View style={st.row}>
            <Text style={st.big}>{tot}<Text style={st.bigUnit}> / {s.setScores.length * x.size}</Text></Text>
            <JudgeTag ctx={ctx} {...sj} />
          </View>
          <Text style={st.note}>{s.setScores.map((v, k) => `第${k + 1}回 ${v}点`).join('　')}</Text>
        </Card>
      )}
      {s.qs.map((q, k) => (
        <Card key={q.k} ctx={ctx}>
          <Text style={st.meta}>問{k + 1}　{q.t}　{refLabel(q)}</Text>
          <Stem ctx={ctx} q={q} />
          <Explain ctx={ctx} q={q} your={s.ans[k]} ok={s.ans[k] === q.a} />
        </Card>
      ))}
    </>
  );
}

/* ---------- 復習：解説 → 付随論点（宅建）／間違えた問題の解説（4択） ---------- */
function LessonView({ ctx, queue }: { ctx: Ctx; queue: ReviewItem[] }) {
  const { st, x, p, go } = ctx;
  const item = queue[0];
  const t = item.key.split('|')[1];
  const L = x.reviewBy === 'topic' ? LESSON[item.key] : undefined;
  const title = groupLabel(x, item.key);
  const toCheck = () => {
    const qs = reviewQuestions(x, p.hist, item.key, item.missed?.q);
    go({ name: 'check', item, rest: queue.slice(1), qs, orders: ordersFor(x, qs) });
  };
  return (
    <>
      <View style={st.rowBetween}>
        <View>
          <Text style={st.note}>復習　残り{queue.length}{x.reviewBy === 'topic' ? '論点' : '分野'}</Text>
          <Text style={st.bold}>{title}</Text>
        </View>
        <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
      </View>
      {item.missed && (
        <Card ctx={ctx}>
          <Text style={st.meta}>あなたが間違えた問題　{item.missed.q.t}　{refLabel(item.missed.q)}</Text>
          <Stem ctx={ctx} q={item.missed.q} />
          <Explain ctx={ctx} q={item.missed.q} your={item.missed.your} ok={false} />
        </Card>
      )}
      {x.reviewBy === 'topic' && <FocusView ctx={ctx} k={item.key} missed={item.missed?.q as Q | undefined} />}
      <Btn ctx={ctx} primary label={x.reviewBy === 'topic' ? `確認例題${reviewCount(x)}問へ` : `${title}の確認例題${reviewCount(x)}問へ`} onPress={toCheck} />
    </>
  );
}

/* ---------- 1段目：間違えた範囲に絞った解説＋体系へのリンク ---------- */
function Chip({ ctx, label, no, on, dashed, onPress }: { ctx: Ctx; label: string; no?: number; on?: boolean; dashed?: boolean; onPress: () => void }) {
  const { c, st } = ctx;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.chip, { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: on ? c.ng : c.line, backgroundColor: on ? c.ngSoft : c.paper }, dashed && { borderStyle: 'dashed' }, pressed && st.pressed]}>
      {no != null && <View style={st.sysNo}><Text style={st.sysNoText}>{no}</Text></View>}
      <Text style={[st.chipText, on && { color: c.ng, fontWeight: '700' }, dashed && { color: c.ai }]}>{label}</Text>
    </Pressable>
  );
}
function TableView({ ctx, title, head, rows, note }: { ctx: Ctx; title: string; head: string[]; rows: string[][]; note?: string }) {
  const { c, st } = ctx;
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.bold}>{title}</Text>
      <View style={st.tblWrap}>
        <View style={[st.tblRow, { backgroundColor: c.aiSoft }]}>
          {head.map((h, k) => <Text key={k} style={[st.tblCell, st.tblHead, k === 0 && st.tblFirst]}>{h}</Text>)}
        </View>
        {rows.map((r, ri) => (
          <View key={ri} style={[st.tblRow, ri % 2 === 1 && { backgroundColor: c.bg }]}>
            {r.map((cell, k) => {
              const m = markOf(cell);
              return <Text key={k} style={[st.tblCell, k === 0 && st.tblFirst, m === 'o' && { color: c.ok, fontWeight: '700' }, m === 'x' && { color: c.ng, fontWeight: '700' }]}>{cell}</Text>;
            })}
          </View>
        ))}
      </View>
      {!!note && <Text style={st.note}>{note}</Text>}
    </View>
  );
}
function FocusView({ ctx, k, missed }: { ctx: Ctx; k: string; missed?: Q }) {
  const { c, st, go, screen } = ctx;
  const L = LESSON[k] || { pts: [], traps: [], rel: [] };
  const t = k.split('|')[1];
  const S = L.sys;
  const hit = S ? relatedBranch(S, missed) : { branch: -1, item: -1 };
  const rows = S ? relatedRows(S, missed) : null;
  const traps = relatedTraps(L, missed);
  const rel = (L.rel || []).filter(x => LESSON[x]);
  const deep = (key: string, focus: number, m?: Q, trail: string[] = []) => go({ name: 'deep', key, focus, missed: m, back: screen, trail });
  return (
    <>
      <Card ctx={ctx}>
        <Text style={st.meta}>間違えた範囲の解説</Text>
        <Text style={st.h2}>{S && hit.branch >= 0 ? `${t}：${S.tree[hit.branch].h}` : `${t}の要点`}</Text>
        {S && hit.branch >= 0 ? (
          <View style={[st.sysBox, { borderColor: c.ng, borderWidth: 2, backgroundColor: c.ngSoft }]}>
            <View style={st.sysHead}>
              <View style={st.sysNo}><Text style={st.sysNoText}>{hit.branch + 1}</Text></View>
              <Text style={st.bold}>{S.tree[hit.branch].h}</Text>
              <Text style={st.sysTag}>間違えた範囲</Text>
            </View>
            {S.tree[hit.branch].items.map((it, j) => (
              <Text key={j} style={[st.sysItem, j === hit.item && { color: c.ng, fontWeight: '700' }]}>・{it}</Text>
            ))}
          </View>
        ) : L.pts.slice(0, 4).map((x, i) => <Text key={i} style={st.li}>・{x}</Text>)}
        {rows && <TableView ctx={ctx} title={rows.table.title} head={rows.table.head} rows={rows.rows}
          note={rows.rows.length < rows.table.rows.length ? `表の一部（${rows.rows.length}／${rows.table.rows.length}行）。全体は「体系的に学ぶ」で。` : undefined} />}
        {traps.length > 0 && (
          <View style={[st.res, { backgroundColor: c.warnSoft, borderLeftColor: c.warn }]}>
            <Text style={[st.resHead, { color: c.warn }]}>この範囲のひっかけ</Text>
            {traps.map((x, i) => <Text key={i} style={st.li}>・{x}</Text>)}
          </View>
        )}
      </Card>
      <ExamplesCard ctx={ctx} L={L} q={missed} />
      <CasesCard ctx={ctx} L={L} q={missed} />
      <AroundCard ctx={ctx} L={L} />
      {S && (
        <Card ctx={ctx}>
          <Text style={st.meta}>体系的に広げる</Text>
          <Text style={st.note}>「{t}」は全{S.tree.length}項目。項目を押すと、その場所から詳しい解説を開きます。</Text>
          <View style={st.wrapRow}>
            {S.tree.map((b, i) => <Chip key={i} ctx={ctx} no={i + 1} label={b.h} on={i === hit.branch} onPress={() => deep(k, i, missed)} />)}
          </View>
          <Pressable onPress={() => deep(k, -1, missed)} style={({ pressed }) => [st.deepLink, pressed && st.pressed]}>
            <Text style={[st.bold, { color: c.ai }]}>{t}を体系的に学ぶ　→</Text>
            <Text style={st.note}>全体像・流れ図・比較表・要点</Text>
          </Pressable>
          {rel.length > 0 && (
            <View style={{ gap: 6 }}>
              {!!L.bridge && <Text style={st.note}>{L.bridge}</Text>}
              <View style={st.wrapRow}>
                {rel.map(x => <Chip key={x} ctx={ctx} dashed label={`${x.split('|')[1]} →`} onPress={() => deep(x, -1, undefined, [k])} />)}
              </View>
            </View>
          )}
        </Card>
      )}
    </>
  );
}

/* ---------- 2段目：論点を体系的に深く学ぶページ ---------- */
/* 具体例（間違えた問題に近い例を先頭に）と周辺知識 */
function ExamplesCard({ ctx, L, q }: { ctx: Ctx; L: Lesson; q?: { s: string; e: string } }) {
  const { c, st } = ctx;
  const o = orderExamples(L, q);
  if (!o.length) return null;
  return (
    <Card ctx={ctx}>
      <Text style={st.meta}>具体例で理解する</Text>
      {o.map(({ ex, near }, i) => (
        <View key={i} style={{ borderWidth: 1, borderRadius: 8, padding: 10, gap: 4, borderColor: near ? c.ai : c.line, backgroundColor: near ? c.aiSoft : 'transparent' }}>
          {near && <Text style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: c.ai, borderWidth: 1, borderColor: c.ai, borderRadius: 999, paddingHorizontal: 8 }}>この問題に近い例</Text>}
          <Text style={st.bold}>{ex.t}</Text>
          <Text style={st.body}>{ex.s}</Text>
          <Text style={[st.body, st.bold]}>→ {ex.p}</Text>
        </View>
      ))}
    </Card>
  );
}
// 判例：問題に関係する判例を先頭に3件、残りは「すべて見る」で開く
function CasesCard({ ctx, L, q }: { ctx: Ctx; L: Lesson; q?: { s: string; e: string } }) {
  const { c, st } = ctx;
  const [all, setAll] = useState(false);
  const o = orderByKw(L.cases || [], q);
  if (!o.length) return null;
  const show = all ? o : o.slice(0, 3);
  return (
    <Card ctx={ctx}>
      <Text style={st.meta}>判例で理解する（{o.length}件）</Text>
      {show.map(({ item: cs, near }, i) => (
        <View key={i} style={{ borderWidth: 1, borderRadius: 8, padding: 10, gap: 4, borderColor: near ? c.ai : c.line, backgroundColor: near ? c.aiSoft : 'transparent' }}>
          {near && <Text style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: c.ai, borderWidth: 1, borderColor: c.ai, borderRadius: 999, paddingHorizontal: 8 }}>この問題に関係する判例</Text>}
          <Text style={st.bold}>{cs.n}</Text>
          <Text style={st.body}><Text style={st.bold}>事案　</Text>{cs.f}</Text>
          <Text style={st.body}><Text style={st.bold}>判断　</Text>{cs.h}</Text>
          <Text style={[st.body, { color: c.warn }]}><Text style={st.bold}>試験では　</Text>{cs.pt}</Text>
        </View>
      ))}
      {o.length > 3 && <Btn ctx={ctx} label={all ? '3件だけ表示' : `ほかの判例も見る（あと${o.length - 3}件）`} onPress={() => setAll(!all)} />}
    </Card>
  );
}
function AroundCard({ ctx, L }: { ctx: Ctx; L: Lesson }) {
  const { st } = ctx;
  if (!L.around?.length) return null;
  return (
    <Card ctx={ctx}>
      <Text style={st.meta}>あわせて覚える周辺知識</Text>
      {L.around.map((a, i) => (
        <View key={i} style={{ gap: 2 }}>
          <Text style={st.bold}>{a.h}</Text>
          <Text style={st.body}>{a.b}</Text>
        </View>
      ))}
    </Card>
  );
}

/* 計算方法・注意事項：説明文はホームに載せず、ここにまとめる（文章は src/data/notes.json。Web版と共通） */
function NotesLink({ ctx, sec, lead, back }: { ctx: Ctx; sec: string; lead: string; back?: Screen }) {
  const { c, st, go } = ctx;
  return (
    <Text style={st.note}>{lead}<Text style={{ color: c.ai, textDecorationLine: 'underline' }} onPress={() => go({ name: 'notes', sec, back })} accessibilityRole="link">※ 計算方法</Text></Text>
  );
}
function NotesView({ ctx, sec, back }: { ctx: Ctx; sec: string; back?: Screen }) {
  const { st, go, scrollToNode } = ctx;
  const refs = useRef<Record<string, View | null>>({});
  useEffect(() => { const id = setTimeout(() => scrollToNode(refs.current[sec] ?? null), 120); return () => clearTimeout(id); }, [sec, scrollToNode]);
  return (
    <>
      <View style={st.rowBetween}>
        <Text style={st.h2}>計算方法・注意事項</Text>
        <Btn ctx={ctx} label="← 戻る" onPress={() => go(back ?? { name: 'home' })} />
      </View>
      {NOTES.map(([id, title, ps]) => (
        <View key={id} ref={el => { refs.current[id] = el; }} collapsable={false}>
          <Card ctx={ctx}>
            <Text style={st.h2}>{title}</Text>
            {ps.map((t, i) => <Text key={i} style={st.body}>{t}</Text>)}
          </Card>
        </View>
      ))}
      <Btn ctx={ctx} label="← 戻る" onPress={() => go(back ?? { name: 'home' })} />
    </>
  );
}

function DeepView({ ctx, s }: { ctx: Ctx; s: Extract<Screen, { name: 'deep' }> }) {
  const { c, st, go, scrollToNode } = ctx;
  const L = LESSON[s.key] || { pts: [], traps: [], rel: [] };
  const t = s.key.split('|')[1];
  const rel = (L.rel || []).filter(x => LESSON[x]);
  const focusRef = useRef<View>(null);
  useEffect(() => {
    if (s.focus < 0) return;
    const id = setTimeout(() => scrollToNode(focusRef.current), 120);
    return () => clearTimeout(id);
  }, [s.key, s.focus, scrollToNode]);
  const back = () => go(s.back);
  return (
    <>
      <View style={st.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={st.note}>体系的に学ぶ{s.trail.length ? '　' + s.trail.map(x => x.split('|')[1]).join(' › ') + ' ›' : ''}</Text>
          <Text style={st.bold}>{t}</Text>
        </View>
        <Btn ctx={ctx} label="← 復習に戻る" onPress={back} />
      </View>
      {L.sys && <SysView ctx={ctx} sys={L.sys} title={t} missed={s.missed} focus={s.focus} focusRef={focusRef} />}
      <Card ctx={ctx}>
        <Text style={st.meta}>要点のまとめ　{fieldName(ctx.x, s.key.split('|')[0])}</Text>
        <Text style={st.h2}>{t}の要点</Text>
        {L.pts.map((x, i) => <Text key={i} style={st.li}>・{x}</Text>)}
        {L.traps?.length > 0 && (
          <View style={[st.res, { backgroundColor: c.warnSoft, borderLeftColor: c.warn }]}>
            <Text style={[st.resHead, { color: c.warn }]}>よく出るひっかけ</Text>
            {L.traps.map((x, i) => <Text key={i} style={st.li}>・{x}</Text>)}
          </View>
        )}
      </Card>
      <ExamplesCard ctx={ctx} L={L} q={s.missed} />
      <CasesCard ctx={ctx} L={L} q={s.missed} />
      <AroundCard ctx={ctx} L={L} />
      {rel.length > 0 && (
        <Card ctx={ctx}>
          <Text style={st.meta}>つながる論点</Text>
          {!!L.bridge && <Text style={st.body}>{L.bridge}</Text>}
          <View style={st.wrapRow}>
            {rel.map(x => <Chip key={x} ctx={ctx} dashed label={`${x.split('|')[1]} →`}
              onPress={() => go({ name: 'deep', key: x, focus: -1, back: s.back, trail: [...s.trail, s.key] })} />)}
          </View>
        </Card>
      )}
      <Btn ctx={ctx} primary label="← 復習に戻る" onPress={back} />
    </>
  );
}

/* ---------- 体系解説：全体像ツリー・流れ図・比較表 ---------- */
const markOf = (x: string): 'o' | 'x' | null =>
  /^(○|◯|必要|可|あり|できる)/.test(x) ? 'o' : /^(×|✕|不要|不可|なし|できない)/.test(x) ? 'x' : null;

function SysView({ ctx, sys, title, missed, focus = -1, focusRef }: { ctx: Ctx; sys: LessonSys; title: string; missed?: Q; focus?: number; focusRef?: React.RefObject<View | null> }) {
  const { c, st } = ctx;
  const hit = relatedBranch(sys, missed);
  return (
    <>
      <Card ctx={ctx}>
        <Text style={st.meta}>全体像（体系図）</Text>
        <Text style={st.h2}>{title}の全体像</Text>
        <Text style={st.body}>{sys.overview}</Text>
        <View style={st.sysRoot}><Text style={st.sysRootText}>{title}</Text></View>
        <View style={st.sysBranches}>
          {sys.tree.map((b, i) => {
            const on = i === hit.branch;
            return (
              <View key={i} style={[st.sysRow, i === focus && st.sysFocus]} ref={i === focus ? focusRef : undefined} collapsable={false}>
                <View style={[st.sysConn, on && { borderTopColor: c.ng }]} />
                <View style={[st.sysBox, on && { borderColor: c.ng, borderWidth: 2, backgroundColor: c.ngSoft }]}>
                  <View style={st.sysHead}>
                    <View style={st.sysNo}><Text style={st.sysNoText}>{i + 1}</Text></View>
                    <Text style={st.bold}>{b.h}</Text>
                    {on && <Text style={st.sysTag}>間違えた範囲</Text>}
                  </View>
                  {b.items.map((it, j) => (
                    <Text key={j} style={[st.sysItem, on && j === hit.item && { color: c.ng, fontWeight: '700' }]}>・{it}</Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </Card>
      {sys.flow && sys.flow.steps.length > 0 && (
        <Card ctx={ctx}>
          <Text style={st.meta}>流れで覚える</Text>
          <Text style={st.h2}>{sys.flow.title}</Text>
          {sys.flow.steps.map((x, i) => (
            <View key={i} style={st.flowRow}>
              <View style={st.flowRail}>
                <View style={st.flowNo}><Text style={st.flowNoText}>{i + 1}</Text></View>
                {i < sys.flow!.steps.length - 1 && <View style={st.flowLine} />}
              </View>
              <Text style={[st.body, { flex: 1, paddingTop: 2, paddingBottom: 10 }]}>{x}</Text>
            </View>
          ))}
        </Card>
      )}
      {sys.tables.length > 0 && (
        <Card ctx={ctx}>
          <Text style={st.meta}>比較表・数字</Text>
          {sys.tables.map((tb, ti) => (
            <View key={ti} style={{ gap: 6 }}>
              <Text style={st.bold}>{tb.title}</Text>
              <View style={st.tblWrap}>
                <View style={[st.tblRow, { backgroundColor: c.aiSoft }]}>
                  {tb.head.map((h, k) => <Text key={k} style={[st.tblCell, st.tblHead, k === 0 && st.tblFirst]}>{h}</Text>)}
                </View>
                {tb.rows.map((r, ri) => (
                  <View key={ri} style={[st.tblRow, ri % 2 === 1 && { backgroundColor: c.bg }]}>
                    {r.map((cell, k) => {
                      const m = markOf(cell);
                      return <Text key={k} style={[st.tblCell, k === 0 && st.tblFirst, m === 'o' && { color: c.ok, fontWeight: '700' }, m === 'x' && { color: c.ng, fontWeight: '700' }]}>{cell}</Text>;
                    })}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

/* ---------- 確認例題（宅建5問・その他3問）。1問ごとに正誤と解説 ---------- */
function Check({ ctx, s }: { ctx: Ctx; s: Extract<Screen, { name: 'check' }> }) {
  const { st, x, p, update, go } = ctx;
  const { item, rest, qs, orders } = s;
  const [k, setK] = useState(0);
  const [right, setRight] = useState(0);
  const [picked, setPicked] = useState<Ans>(null);
  const title = groupLabel(x, item.key);
  const pRef = useRef(p);
  pRef.current = p;

  if (!qs.length) {
    // 無料版で、この論点に無料の問題がない
    return (
      <Card ctx={ctx}>
        <Text style={st.h2}>{title}</Text>
        <Text style={st.body}>この論点の確認例題は、全問を解放すると解けるようになります。</Text>
        <View style={st.wrapRow}>
          {rest.length ? <Btn ctx={ctx} primary label="次の論点へ" onPress={() => startReview(ctx, rest)} /> : null}
          <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
        </View>
      </Card>
    );
  }

  if (k >= qs.length) {
    const J = reviewJudge(right, qs.length);
    const ok = J.tone === 'ok';
    return (
      <Card ctx={ctx}>
        <Text style={st.h2}>{title}　確認例題の結果</Text>
        <View style={st.row}>
          <Text style={st.big}>{right}<Text style={st.bigUnit}> / {qs.length}</Text></Text>
          <JudgeTag ctx={ctx} {...J} />
        </View>
        <Text style={st.note}>
          {ok ? `この${x.reviewBy === 'topic' ? '論点' : '分野'}は理解できています。` : x.reviewBy === 'topic' ? `もう一度、解説を読んでから別の${reviewCount(x)}問に挑戦できます。` : `別の${reviewCount(x)}問にもう一度挑戦できます。`}
        </Text>
        <View style={st.wrapRow}>
          {!ok && <Btn ctx={ctx} label={x.reviewBy === 'topic' ? '解説に戻ってもう一度' : `もう一度${reviewCount(x)}問`} onPress={() => startReview(ctx, [item, ...rest])} />}
          {rest.length
            ? <Btn ctx={ctx} primary label={`次の${x.reviewBy === 'topic' ? '論点' : '分野'}へ（残り${rest.length}）`} onPress={() => startReview(ctx, rest)} />
            : <Btn ctx={ctx} primary label={x.rounds ? `第${p.set.round + 1}回の模試へ` : '次の模試へ'} onPress={() => startExam(ctx)} />}
          <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
        </View>
      </Card>
    );
  }

  const q = qs[k];
  const answer = (v: number) => {
    if (picked != null) return;
    const ok = v === q.a;
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    setPicked(v);
    if (ok) setRight(right + 1);
    update(record(pRef.current, q, ok));
  };
  return (
    <>
      <View style={st.rowBetween}>
        <View>
          <Text style={st.note}>確認例題　{k + 1} / {qs.length}　正解 {right}</Text>
          <Text style={st.bold}>{title}</Text>
        </View>
        <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
      </View>
      <Card ctx={ctx}>
        <Text style={st.meta}>{x.reviewBy === 'field' ? `${q.t}　` : ''}{refLabel(q)}</Text>
        <Stem ctx={ctx} q={q} />
        <AnswerPad ctx={ctx} q={q} order={orders[k]} value={picked} locked={picked != null} onAnswer={answer} />
        {picked != null && (
          <>
            <Explain ctx={ctx} q={q} ok={picked === q.a} your={q.c ? picked : undefined} />
            <Btn ctx={ctx} primary label="次へ" onPress={() => { setPicked(null); setK(k + 1); }} />
          </>
        )}
      </Card>
    </>
  );
}

/* ---------- スタイル ---------- */
export type Styles = ReturnType<typeof makeStyles>;
function makeStyles(c: Colors) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    wrap: { padding: 16, paddingBottom: 56, gap: 16 },
    h1: { fontFamily: fonts.disp, fontWeight: '800', fontSize: 26, color: c.ink },
    h2: { fontFamily: fonts.disp, fontWeight: '700', fontSize: 18, color: c.ink, flexShrink: 1 },
    h3: { fontFamily: fonts.body, fontWeight: '700', fontSize: 14, color: c.muted },
    sub: { fontFamily: fonts.body, fontSize: 13, color: c.muted, lineHeight: 20 },
    body: { fontFamily: fonts.body, fontSize: 15, color: c.ink, lineHeight: 25 },
    li: { fontFamily: fonts.body, fontSize: 15, color: c.ink, lineHeight: 25 },
    bold: { fontFamily: fonts.body, fontSize: 15, color: c.ink, fontWeight: '700' },
    note: { fontFamily: fonts.body, fontSize: 13, color: c.muted, lineHeight: 20 },
    memo: { fontFamily: fonts.body, fontSize: 14, color: c.ink, lineHeight: 22 },
    meta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, fontWeight: '700' },
    stmt: { fontFamily: fonts.body, fontSize: 17, color: c.ink, lineHeight: 29 },
    passage: { borderLeftWidth: 3, borderLeftColor: c.line, paddingLeft: 12 },
    card: { backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 16, gap: 12 },
    cardNow: { borderColor: c.ai, borderWidth: 2 },
    tag: { fontSize: 12, fontWeight: '700', color: c.ai, backgroundColor: c.aiSoft, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
    btnText: { fontFamily: fonts.body, fontWeight: '700', fontSize: 15, color: c.ink },
    btnPri: { backgroundColor: c.ai, borderColor: c.ai },
    btnPriText: { color: c.onAi },
    btnSel: { backgroundColor: c.aiSoft, borderColor: c.ai, borderWidth: 2 },
    btnSelText: { color: c.ai },
    btnDis: { opacity: 0.45 },
    btnBig: { minHeight: 64 },
    btnBigText: { fontSize: 30, fontWeight: '800', lineHeight: 36 },
    btnLeft: { alignItems: 'flex-start' },
    btnLeftText: { fontWeight: '500', fontSize: 16, lineHeight: 24 },
    pressed: { opacity: 0.7 },
    slots: { flexDirection: 'row', gap: 6 },
    slot: { flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: 8, paddingVertical: 8, alignItems: 'center', gap: 2 },
    slotNow: { borderColor: c.ai, borderWidth: 2, backgroundColor: c.aiSoft },
    slotText: { fontSize: 12, color: c.muted, fontFamily: fonts.body },
    slotScore: { fontSize: 16, fontWeight: '700', color: c.ink, fontFamily: fonts.body },
    slotMix: { fontSize: 10.5, color: c.muted, textAlign: 'center', fontFamily: fonts.body },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7 },
    tile: { width: '23.6%', aspectRatio: 1, borderRadius: 10, borderWidth: 1.5, padding: 6, justifyContent: 'space-between' },
    tileName: { fontFamily: fonts.body, fontSize: 12, lineHeight: 15, fontWeight: '700' },
    tileNum: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
    tileNumS: { fontSize: 9.5, fontWeight: '600' },
    tilePct: { fontFamily: fonts.body, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'], alignSelf: 'flex-end' },
    tileBar: { height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' },
    tileBarFill: { height: 8, borderRadius: 4, backgroundColor: c.ok },
    tileDone: { fontSize: 11, fontWeight: '800', color: c.onAi, backgroundColor: c.warn, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 9, overflow: 'hidden' },
    kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kpi: { flexBasis: '31%', flexGrow: 1, borderWidth: 1, borderColor: c.line, borderRadius: 8, padding: 10, gap: 2 },
    kpiWide: { borderWidth: 1, borderColor: c.line, borderRadius: 8, padding: 12, gap: 4 },
    kpiVal: { fontSize: 20, fontWeight: '700', color: c.ink, fontFamily: fonts.body },
    histRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
    chip: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
    chipText: { fontSize: 13, color: c.ink, fontFamily: fonts.body },
    confirm: { backgroundColor: c.warnSoft, borderRadius: 8, padding: 12, gap: 8 },
    timer: { fontSize: 30, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
    dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'space-between' },
    dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.paper },
    dotText: { fontSize: 13, color: c.ink, fontWeight: '700' },
    ox: { flexDirection: 'row', gap: 12 },
    res: { borderLeftWidth: 4, borderRadius: 6, padding: 12, gap: 6 },
    resHead: { fontWeight: '700', fontSize: 15, fontFamily: fonts.body },
    judge: { fontWeight: '700', fontSize: 14, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, overflow: 'hidden' },
    big: { fontSize: 44, fontWeight: '800', color: c.ink, fontFamily: fonts.disp },
    bigUnit: { fontSize: 18, fontWeight: '600', color: c.muted },
    sysRoot: { alignSelf: 'flex-start', backgroundColor: c.ai, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
    sysRootText: { color: c.onAi, fontWeight: '700', fontSize: 16, fontFamily: fonts.disp },
    sysBranches: { marginLeft: 16, borderLeftWidth: 2, borderLeftColor: c.line, paddingTop: 8, gap: 10, marginTop: -12 },
    sysRow: { flexDirection: 'row', alignItems: 'flex-start' },
    sysConn: { width: 16, marginTop: 22, borderTopWidth: 2, borderTopColor: c.line },
    sysBox: { flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 10, gap: 2, backgroundColor: c.paper },
    sysHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 },
    sysNo: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.aiSoft, alignItems: 'center', justifyContent: 'center' },
    sysNoText: { fontSize: 12, fontWeight: '700', color: c.ai },
    sysTag: { fontSize: 11, fontWeight: '700', color: c.paper, backgroundColor: c.ng, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
    sysItem: { fontSize: 14, lineHeight: 22, color: c.ink, fontFamily: fonts.body },
    flowRow: { flexDirection: 'row', gap: 12 },
    flowRail: { width: 28, alignItems: 'center' },
    flowNo: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.ai, alignItems: 'center', justifyContent: 'center' },
    flowNoText: { color: c.onAi, fontWeight: '700', fontSize: 13 },
    flowLine: { flex: 1, width: 2, backgroundColor: c.ai, marginVertical: 2 },
    tblWrap: { borderWidth: 1, borderColor: c.line, borderRadius: 8, overflow: 'hidden' },
    tblRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    tblCell: { flex: 1, paddingVertical: 7, paddingHorizontal: 8, fontSize: 13, lineHeight: 19, color: c.ink, fontFamily: fonts.body },
    tblHead: { fontWeight: '700' },
    tblFirst: { flex: 1.3, fontWeight: '700' },
    barBg: { height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' },
    barFg: { height: 8, borderRadius: 4, backgroundColor: c.ai },
    passRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6 },
    sysFocus: { borderWidth: 3, borderColor: c.ai, borderRadius: 12, padding: 2 },
    deepLink: { borderWidth: 1, borderColor: c.ai, borderRadius: 8, padding: 12, gap: 2 },
  });
}
