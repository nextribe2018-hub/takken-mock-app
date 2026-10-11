import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { EXAM, EXAMS, Exam, ExamId, Item } from './src/exams';
import {
  buildFieldExam, EXAM_N, FIELDS, fieldStats, finishFieldExam, PASS_LINES, passEstimate, LESSON, Progress, Q,
  buildRound, choiceOrder, emptyProgress, fieldStatsBy, finishRound, judge, judgeSet, LessonSys, record,
  relatedBranch, relatedRows, relatedTraps, reviewQuestions, speechText, statsBy, topicState, topicTier, Tier, fourChoice, wrongGroups,
} from './src/logic';
import { loadLastExam, loadProgress, saveLastExam, saveProgress } from './src/storage';
import { Colors, fonts, useColors, mix } from './src/theme';

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
  | { name: 'deep'; key: string; focus: number; missed?: Q; back: Screen; trail: string[] };

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
  const [all, setAll] = useState<Record<ExamId, Progress> | null>(null);
  const [examId, setExamId] = useState<ExamId>('takken');
  const [last, setLast] = useState<ExamId | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'select' });
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  // 体系ページで、押した項目の位置までスクロールする
  const scrollToNode = useCallback((node: View | null) => {
    if (!node || !contentRef.current) return;
    node.measureLayout(contentRef.current, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true }), () => {});
  }, []);

  useEffect(() => {
    Promise.all([Promise.all(EXAMS.map(x => loadProgress(x))), loadLastExam()]).then(([ps, l]) => {
      setAll(Object.fromEntries(EXAMS.map((x, i) => [x.id, ps[i]])) as Record<ExamId, Progress>);
      setLast(l);
    });
  }, []);

  const x = EXAM[examId];
  const update = useCallback((next: Progress) => {
    setAll(a => (a ? { ...a, [examId]: next } : a));
    saveProgress(next, EXAM[examId]);
  }, [examId]);
  const go = useCallback((s: Screen) => {
    Speech.stop();
    setScreen(s);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const speak = useCallback((t: string) => {
    Speech.stop();
    Speech.speak(speechText(t), { language: 'ja-JP' });
  }, []);
  const choose = useCallback((id: ExamId) => {
    setExamId(id);
    setLast(id);
    saveLastExam(id);
    go({ name: 'home' });
  }, [go]);

  if (!all) {
    return <View style={[st.fill, st.center]}><ActivityIndicator color={c.ai} /></View>;
  }

  const ctx: Ctx = { c, st, x, p: all[examId], update, go, speak, scrollToNode, screen };
  return (
    <SafeAreaView style={st.fill} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <ScrollView ref={scrollRef}>
        <View ref={contentRef} collapsable={false} style={st.wrap}>
        {screen.name === 'select' && <Select ctx={ctx} all={all} last={last} onChoose={choose} />}
        {screen.name === 'home' && <Home ctx={ctx} />}
        {screen.name === 'exam' && <ExamView ctx={ctx} s={screen} />}
        {screen.name === 'result' && <Result ctx={ctx} s={screen} />}
        {screen.name === 'lesson' && <LessonView ctx={ctx} queue={screen.queue} />}
        {screen.name === 'check' && <Check ctx={ctx} s={screen} />}
        {screen.name === 'deep' && <DeepView key={screen.key + screen.focus} ctx={ctx} s={screen} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type Ctx = {
  c: Colors; st: ReturnType<typeof makeStyles>; x: Exam; p: Progress;
  update: (p: Progress) => void; go: (s: Screen) => void; speak: (t: string) => void;
  scrollToNode: (node: View | null) => void; screen: Screen;
};

/* ---------- 試験ごとの表示の小道具 ---------- */
const fieldName = (x: Exam, f: string) => x.fields.find(([k]) => k === f)?.[1] ?? f;
const kindName = (x: Exam, q: Item) => x.kinds?.find(([k]) => k === q.kind)?.[1];
const refLabel = (q: Item) => (q.ref === '確認' ? '確認問題' : q.ref);
const ansText = (q: Item, a: Ans) => (a == null ? '未回答' : q.c ? q.c[a] : a ? '○' : '×');
// 読み上げ：4択は表示順に選択肢も読む
const speakText = (q: Item, order: Order) =>
  q.c ? `${q.s}。${order.map((i, n) => `${n + 1}、${q.c![i]}`).join('。')}` : q.s;
const groupLabel = (x: Exam, key: string) => {
  const [f, t] = key.split('|');
  return x.reviewBy === 'topic' ? t : fieldName(x, f);
};
const nextLabel = (x: Exam, p: Progress) => (x.rounds ? `第${p.set.round + 1}回へ進む` : 'もう1回（10問）');
const startExam = (ctx: Ctx) => {
  const { x, p, go } = ctx;
  const round = x.rounds ? p.set.round : 0;
  const qs = buildRound(x, p.hist, round);
  go({ name: 'exam', qs, orders: ordersFor(x, qs), round });
};
// 宅建の分野別10問テストを始める
const startFieldExam = (ctx: Ctx, f: Q['f']) => {
  const { x, p, go } = ctx;
  const qs = buildFieldExam(p.hist, f);
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
function Select({ ctx, all, last, onChoose }: {
  ctx: Ctx; all: Record<ExamId, Progress>; last: ExamId | null; onChoose: (id: ExamId) => void;
}) {
  const { st } = ctx;
  const groups = [...new Set(EXAMS.map(x => x.group))];
  return (
    <>
      <View style={{ gap: 4 }}>
        <Text style={st.h1}>10分模試</Text>
        <Text style={st.sub}>10問を10分。間違えたところはその場で解説と確認例題で復習します。試験を選んでください。</Text>
      </View>
      {groups.map(g => (
        <View key={g} style={{ gap: 10 }}>
          <Text style={st.h3}>{g}</Text>
          {EXAMS.filter(x => x.group === g).map(x => {
            const hist = all[x.id].hist;
            const done = Object.keys(hist).length;
            let n = 0, cc = 0;
            Object.values(hist).forEach(h => { n += h.n; cc += h.c; });
            return (
              <Pressable key={x.id} accessibilityRole="button" onPress={() => onChoose(x.id)}
                style={({ pressed }) => [st.card, x.id === last && st.cardNow, pressed && st.pressed]}>
                <View style={st.rowBetween}>
                  <Text style={st.h2}>{x.name}</Text>
                  {x.id === last && <Text style={st.tag}>前回</Text>}
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
      <Footer ctx={ctx} />
    </>
  );
}

/* ---------- ホーム ---------- */
function Home({ ctx }: { ctx: Ctx }) {
  const { c, st, x, p, update, go } = ctx;
  const [confirm, setConfirm] = useState(false);
  const hist = p.hist;
  const done = Object.keys(hist).length;
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
  // 宅建：直近10問の正答率で色分け。5問未満は点線・薄い色（参考値）
  const tierStyle = (tier: Tier, few: boolean) => {
    const base: Record<Tier, { fg: string; bg: string; bd: string }> = {
      none: { fg: c.ink, bg: c.paper, bd: c.line },
      perfect: { fg: c.paper, bg: c.ok, bd: c.ok },
      good: { fg: c.ok, bg: c.okSoft, bd: c.ok },
      mid: { fg: c.warn, bg: c.warnSoft, bd: c.warn },
      low: { fg: c.or, bg: c.orSoft, bd: c.or },
      bad: { fg: c.ng, bg: c.ngSoft, bd: c.ng },
    };
    const b = base[tier];
    if (!few || tier === 'none') return b;
    if (tier === 'perfect') return { fg: c.ink, bg: mix(c.ok, c.paper, 0.72), bd: c.ok };
    return { fg: b.fg, bg: mix(b.bg, c.paper, 0.55), bd: mix(b.bd, c.paper, 0.45) };
  };
  const tierChip = (s: (typeof ts)[number]) => {
    const { tier, few } = topicTier(s);
    const ts2 = tierStyle(tier, few);
    return (
      <Pressable key={s.t} onPress={() => go({ name: 'lesson', queue: [{ key: `${s.f}|${s.t}` }] })}
        style={({ pressed }) => [st.chip, { borderColor: ts2.bd, backgroundColor: ts2.bg, borderStyle: few ? 'dashed' : 'solid', opacity: tier === 'none' ? 0.75 : 1 }, pressed && st.pressed]}>
        <Text style={[st.chipText, { color: ts2.fg }, tier === 'perfect' && !few && { fontWeight: '700' }]}>{s.t}{s.n ? ` 直近${Math.round((s.rc / Math.max(1, s.rn)) * 100)}%/${s.rn}問・全${Math.round((s.c / s.n) * 100)}%` : ''}</Text>
      </Pressable>
    );
  };

  return (
    <>
      <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="‹ 試験を選ぶ" onPress={() => go({ name: 'select' })} /></View>
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
        <View style={st.rowBetween}>
          <Text style={st.body}>音声で出題</Text>
          <Switch value={p.voice} onValueChange={v => update({ ...p, voice: v })} trackColor={{ true: c.ai }} />
        </View>
        <Text style={st.note}>
          目安：10問中 8問以上で合格圏、7問は合格ライン上。{x.rounds ? '5回合計で35点が7割、37点以上なら安全圏です。' : ''}
        </Text>
      </Card>

      {tk && <PassCard ctx={ctx} />}
      {tk && <FourCard ctx={ctx} />}

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
            ? '押すと、その論点の解説と確認例題3問。色は直近10問の正答率：濃い緑＝100%／緑＝80%以上／黄＝60〜79%／橙＝40〜59%／赤＝40%未満／点線・薄い色＝5問未満（参考値）／無色＝未着手'
            : `押すと、その${unit}の${x.reviewBy === 'topic' ? '解説と' : ''}確認例題3問。赤＝要復習／黄＝習得中／緑＝習得／無色＝未着手`}
        </Text>
        {x.reviewBy === 'topic'
          ? x.fields.map(([f, n]) => (
            <View key={f} style={{ gap: 6 }}>
              <Text style={st.h3}>{n}</Text>
              <View style={st.wrapRow}>{ts.filter(s => s.f === f).map(s => (tk ? tierChip(s) : chip(s, `${s.f}|${s.t}`)))}</View>
            </View>
          ))
          : <View style={st.wrapRow}>{ts.map(s => chip(s, `${s.f}|`))}</View>}
      </Card>

      <Card ctx={ctx}>
        <View style={st.wrapRow}>
          {!!x.rounds && <Btn ctx={ctx} label="セットを第1回からやり直す" onPress={() => update({ ...p, set: { round: 0, scores: [] } })} />}
          <Btn ctx={ctx} label="学習記録をすべて消す" onPress={() => setConfirm(true)} />
        </View>
        {confirm && (
          <View style={st.confirm}>
            <Text style={st.body}>{x.name}の解いた記録と正答率がすべて消えます。</Text>
            <View style={st.wrapRow}>
              <Btn ctx={ctx} label="消す" onPress={() => { update({ ...emptyProgress(), voice: p.voice }); setConfirm(false); }} />
              <Btn ctx={ctx} label="やめる" onPress={() => setConfirm(false)} />
            </View>
          </View>
        )}
        <Text style={st.note}>
          学習記録はこの端末に試験ごとに保存されます。
          {x.format === 'ox' ? '問題は各論点を○×形式で確認するもので、出典は「年度-問-肢」で表示します。' : '選択肢の順番は毎回入れ替わります。'}
          {x.kinds ? `問題は「${x.kinds.map(k => k[1]).join('」と「')}」の2種類です。` : ''}
        </Text>
        <Footer ctx={ctx} />
      </Card>
    </>
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
      <Text style={st.body}>直近の○×正答率 <Text style={st.bold}>{Math.round(P.ox * 100)}%</Text>（全体 {Math.round(P.oxAll * 100)}%） → 推定4択正答率 <Text style={st.bold}>{Math.round(P.four * 100)}%</Text> → 予想得点 <Text style={st.bold}>{Math.round(P.mean)}点</Text> / 50（8割の確率で {P.lo}〜{P.hi}点）</Text>
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
            <Text style={[st.bold, { width: 40 }]}>{s.rn ? `${Math.round((s.rc / s.rn) * 100)}%` : '—'}</Text>
            <Text style={[st.note, { width: 40 }]}>{s.n ? `${Math.round((s.c / s.n) * 100)}%` : '—'}</Text>
            <Text style={[st.note, { width: 40 }]}>{Math.round((e / EXAM_N[f]) * 100)}%</Text>
            <Text style={[st.note, { width: 64 }]}>{e.toFixed(1)}/{EXAM_N[f]}</Text>
            <View style={[st.barBg, { flex: 1 }]}><View style={[st.barFg, { width: `${Math.round((e / EXAM_N[f]) * 100)}%` }]} /></View>
          </View>
        );
      })}
      <Btn ctx={ctx} primary label={`いちばん伸ばせる「${fieldName(ctx.x, P.focus)}」の10問テスト`}
        onPress={() => startFieldExam(ctx, P.focus)} />
      <Text style={st.note}>合格確率は論点ごとの直近10問の正答率（分野ごとに合算、計{P.rn}問）で計算。分野の行は 直近／全体／推定4択／予想点。見込み＝例年の合格点33〜37点のどれになっても同じ確率として平均した合格確率（大きな数字は「標準」）。4択の推計では各肢の判断を「確信して正しい／迷う（半々）／確信して誤る」に分け、確信した肢で選び、なければ消去法で迷う肢に絞って（多くは2択）選ぶとして計算。○×の誤りのうち迷いの割合で3通りを表示（○×80%なら4択は慎重62%・標準71%・消去法が効く82%）。全回答（{P.total}回）から本試験50問を3,000回シミュレーション。5問免除は考慮していません。合格を保証するものではありません。</Text>
    </Card>
  );
}

/* 過去問の4択に戻す：肢をまとめ直し、元の4択1問の正解率を推計 */
function FourCard({ ctx }: { ctx: Ctx }) {
  const { c, st, p, go } = ctx;
  const F = useMemo(() => fourChoice(p.hist, p.r10), [p.hist, p.r10]);
  const four = useMemo(() => passEstimate(p.hist, 500, p.r10), [p.hist, p.r10]);
  const [all, setAll] = useState(false);
  if (!F.n) return null;
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  const tone = (x: number) => (x >= 0.7 ? c.ok : x >= 0.4 ? c.warn : c.ng);
  return (
    <Card ctx={ctx}>
      <Text style={st.h2}>過去問の4択に戻すと</Text>
      <Text style={st.note}>○×に分けた肢を、元の過去問（同じ年度・問番号）ごとにまとめ直して、その4択1問を正解できる確率を推計しています。</Text>
      <View style={st.kpis}>
        <Kpi ctx={ctx} label="推計できた4択" value={`${F.n}/${F.total}問`} />
        <Kpi ctx={ctx} label="平均の正解率" value={pc(F.avg)} />
        <Kpi ctx={ctx} label={`3肢以上解いた${F.nSolid}問`} value={F.avgSolid == null ? '—' : pc(F.avgSolid)} />
      </View>
      {four.ready && <Text style={st.body}>参考：○×正答率からの換算は <Text style={st.bold}>{pc(four.four)}</Text>。3肢以上解いた問題の平均と大きく違うときは、苦手な肢が特定の問題に集まっている可能性があります。</Text>}
      {(all ? F.items : F.items.slice(0, 6)).map(x => {
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
      {F.n > 6 && <Btn ctx={ctx} label={all ? '弱い6問だけ表示' : `すべて表示（${F.n}問）`} onPress={() => setAll(!all)} />}
      <Text style={st.note}>正解率の低い順。肢の色：緑＝正解／赤＝誤り／無色＝未回答／?＝データにない肢。押すと、いちばん弱い肢の論点の解説と確認例題へ。計算方法：解いた肢はその肢の成績を論点の実力で1回分ならし（1回正解しただけで100%にしない）、未回答の肢・データにない肢は論点の直近10問の正答率で補う（解いた数が少ない論点は分野の正答率に寄せる）。その4肢を「合格の見込み」と同じ考え方（確信・迷い・誤信、標準）で4択に組み立て、正解の肢がどれでも同じ確率として平均。個数・組合せ問題は4肢すべての正誤が分かる確率で近似（やや厳しめ）。</Text>
    </Card>
  );
}

/* ---------- 試験 ---------- */
function ExamView({ ctx, s }: { ctx: Ctx; s: Extract<Screen, { name: 'exam' }> }) {
  const { c, st, x, p, update, go, speak } = ctx;
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

  useEffect(() => { if (p.voice) speak(speakText(qs[cur], orders[cur])); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = qs[cur];
  const choose = (v: number) => {
    if (instant) {
      // 1問ごとにその場で正誤と解説を表示（答えは確定）。10問テスト・分野別とも同じ
      if (ans[cur] != null) return;
      const ok = v === qs[cur].a;
      Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
      const next = [...ans]; next[cur] = v; setAns(next);
      if (p.voice) speak(`${ok ? '正解。' : '不正解。'}答えは${qs[cur].a ? 'まる' : 'ばつ'}。${qs[cur].e}`);
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
        <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="読み上げ" onPress={() => speak(speakText(q, orders[cur]))} /></View>
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
                ? '間違えた論点ごとに「解説 → 付随する論点 → 確認例題3問」の順で復習します。'
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
  const { st, x, p, go, speak } = ctx;
  const item = queue[0];
  const t = item.key.split('|')[1];
  const L = x.reviewBy === 'topic' ? LESSON[item.key] : undefined;
  const title = groupLabel(x, item.key);
  useEffect(() => {
    if (!p.voice || !L) return;
    const h = L.sys ? relatedBranch(L.sys, item.missed?.q as Q | undefined) : { branch: -1 };
    if (L.sys && h.branch >= 0) speak(`${t}、${L.sys.tree[h.branch].h}。${L.sys.tree[h.branch].items.join('。')}`);
    else if (L.pts.length) speak(`${t}の要点。${L.pts.slice(0, 4).join('。')}`);
  }, [item.key]); // eslint-disable-line react-hooks/exhaustive-deps
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
      <Btn ctx={ctx} primary label={x.reviewBy === 'topic' ? '確認例題3問へ' : `${title}の確認例題3問へ`} onPress={toCheck} />
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

/* ---------- 確認例題3問 ---------- */
function Check({ ctx, s }: { ctx: Ctx; s: Extract<Screen, { name: 'check' }> }) {
  const { st, x, p, update, go, speak } = ctx;
  const { item, rest, qs, orders } = s;
  const [k, setK] = useState(0);
  const [right, setRight] = useState(0);
  const [picked, setPicked] = useState<Ans>(null);
  const title = groupLabel(x, item.key);
  const pRef = useRef(p);
  pRef.current = p;

  useEffect(() => { if (p.voice && k < qs.length) speak(speakText(qs[k], orders[k])); }, [k]); // eslint-disable-line react-hooks/exhaustive-deps

  if (k >= qs.length) {
    const ok = right === qs.length;
    return (
      <Card ctx={ctx}>
        <Text style={st.h2}>{title}　確認例題の結果</Text>
        <View style={st.row}>
          <Text style={st.big}>{right}<Text style={st.bigUnit}> / {qs.length}</Text></Text>
          <JudgeTag ctx={ctx} tone={ok ? 'ok' : right >= 2 ? 'mid' : 'ng'} label={ok ? '習得' : right >= 2 ? 'もう一息' : '要復習'} />
        </View>
        <Text style={st.note}>
          {ok ? `この${x.reviewBy === 'topic' ? '論点' : '分野'}は理解できています。` : x.reviewBy === 'topic' ? 'もう一度、解説を読んでから別の3問に挑戦できます。' : '別の3問にもう一度挑戦できます。'}
        </Text>
        <View style={st.wrapRow}>
          {!ok && <Btn ctx={ctx} label={x.reviewBy === 'topic' ? '解説に戻ってもう一度' : 'もう一度3問'} onPress={() => startReview(ctx, [item, ...rest])} />}
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
    if (p.voice) speak(`${ok ? '正解。' : '不正解。'}答えは${q.c ? q.c[q.a] : q.a ? 'まる' : 'ばつ'}。${q.e}`);
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
        <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="読み上げ" onPress={() => speak(speakText(q, orders[k]))} /></View>
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
