import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import {
  BANK, buildFieldExam, EXAM_N, FIELDS, fieldStats, finishFieldExam, PASS_LINE, passEstimate, LESSON, LIMIT, MIX, Progress, Q, buildExam, checkQuestions, emptyProgress,
  fieldName, finishExam, judge, judgeSet, LessonSys, rec, relatedBranch, relatedRows, relatedTraps, speechText, topicState, topicStats, wrongTopics,
} from './src/logic';
import { loadProgress, saveProgress } from './src/storage';
import { Colors, fonts, useColors } from './src/theme';

type Ans = 0 | 1 | null;
type Missed = { q: Q; your: Ans };
type ReviewItem = { key: string; missed?: Missed };
type Screen =
  | { name: 'home' }
  | { name: 'exam'; qs: Q[]; round: number; field?: Q['f'] }
  | { name: 'result'; qs: Q[]; ans: Ans[]; score: number; round: number; used: number; setScores: number[] | null; field?: Q['f'] }
  | { name: 'lesson'; queue: ReviewItem[] }
  | { name: 'check'; item: ReviewItem; rest: ReviewItem[]; qs: Q[] }
  | { name: 'deep'; key: string; focus: number; missed?: Q; back: Screen; trail: string[] };

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
  const [p, setP] = useState<Progress | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  // 体系ページで、押した項目の位置までスクロールする
  const scrollToNode = useCallback((node: View | null) => {
    if (!node || !contentRef.current) return;
    node.measureLayout(contentRef.current, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true }), () => {});
  }, []);

  useEffect(() => { loadProgress().then(setP); }, []);

  const update = useCallback((next: Progress) => { setP(next); saveProgress(next); }, []);
  const go = useCallback((s: Screen) => {
    Speech.stop();
    setScreen(s);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const speak = useCallback((t: string) => {
    Speech.stop();
    Speech.speak(speechText(t), { language: 'ja-JP' });
  }, []);

  if (!p) {
    return <View style={[st.fill, st.center]}><ActivityIndicator color={c.ai} /></View>;
  }

  const ctx: Ctx = { c, st, p, update, go, speak, scrollToNode, screen };
  return (
    <SafeAreaView style={st.fill} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <ScrollView ref={scrollRef}>
        <View ref={contentRef} collapsable={false} style={st.wrap}>
        {screen.name === 'home' && <Home ctx={ctx} />}
        {screen.name === 'exam' && <Exam ctx={ctx} qs={screen.qs} round={screen.round} field={screen.field} />}
        {screen.name === 'result' && <Result ctx={ctx} s={screen} />}
        {screen.name === 'lesson' && <LessonView ctx={ctx} queue={screen.queue} />}
        {screen.name === 'check' && <Check ctx={ctx} item={screen.item} rest={screen.rest} qs={screen.qs} />}
        {screen.name === 'deep' && <DeepView key={screen.key + screen.focus} ctx={ctx} s={screen} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type Ctx = {
  c: Colors; st: ReturnType<typeof makeStyles>; p: Progress;
  update: (p: Progress) => void; go: (s: Screen) => void; speak: (t: string) => void;
  scrollToNode: (node: View | null) => void; screen: Screen;
};

/* ---------- 共通部品 ---------- */
function Btn({ ctx, label, onPress, primary, disabled, selected, big }: {
  ctx: Ctx; label: string; onPress: () => void; primary?: boolean; disabled?: boolean; selected?: boolean; big?: boolean;
}) {
  const { st } = ctx;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [st.btn, primary && st.btnPri, selected && st.btnSel, disabled && !selected && st.btnDis, big && st.btnBig, pressed && st.pressed]}
    >
      <Text style={[st.btnText, primary && st.btnPriText, selected && st.btnSelText, big && st.btnBigText]}>{label}</Text>
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

function Explain({ ctx, q, your, ok }: { ctx: Ctx; q: Q; your?: Ans; ok: boolean }) {
  const { c, st } = ctx;
  return (
    <View style={[st.res, { backgroundColor: ok ? c.okSoft : c.ngSoft, borderLeftColor: ok ? c.ok : c.ng }]}>
      <Text style={[st.resHead, { color: ok ? c.ok : c.ng }]}>
        {ok ? '正解' : '不正解'}
        {your !== undefined ? `　あなた：${your == null ? '未回答' : your ? '○' : '×'}` : ''}
        {`　答え：${q.a ? '○' : '×'}`}
      </Text>
      <Text style={st.body}>{q.e}</Text>
      <Text style={st.memo}>覚え方：<Text style={st.bold}>{q.m}</Text></Text>
    </View>
  );
}
const refLabel = (q: Q) => (q.ref === '確認' ? '確認問題' : q.ref);

/* ---------- ホーム ---------- */
function Home({ ctx }: { ctx: Ctx }) {
  const { c, st, p, update, go } = ctx;
  const [confirm, setConfirm] = useState(false);
  const hist = p.hist;
  const done = Object.keys(hist).length;
  let tn = 0, tc = 0;
  Object.values(hist).forEach(h => { tn += h.n; tc += h.c; });
  const rate = tn ? Math.round((tc / tn) * 100) : null;
  const r = p.set.round;
  const setTotal = p.set.scores.reduce((a, b) => a + (b || 0), 0);
  const ts = topicStats(hist);
  const weak = ts.filter(s => topicState(s) === 1);
  const stateColor = [c.line, c.ng, c.warn, c.ok];
  const stateBg = [c.paper, c.ngSoft, c.warnSoft, c.okSoft];

  return (
    <>
      <View style={{ gap: 4 }}>
        <Text style={st.h1}>宅建 10分模試</Text>
        <Text style={st.sub}>本試験と同じ分野比率で10問を10分。5回で50問＝1回分の本試験です。</Text>
      </View>

      <Card ctx={ctx}>
        <View style={st.rowBetween}>
          <Text style={st.h2}>第{r + 1}回 / 5回</Text>
          <Text style={st.note}>{p.set.scores.length ? `ここまで ${setTotal} / ${p.set.scores.length * 10}点` : 'まだ解いていません'}</Text>
        </View>
        <View style={st.slots}>
          {MIX.map((m, k) => (
            <View key={k} style={[st.slot, k === r && st.slotNow]}>
              <Text style={st.slotText}>第{k + 1}回</Text>
              <Text style={st.slotScore}>{p.set.scores[k] != null ? `${p.set.scores[k]}点` : '—'}</Text>
              <Text style={st.slotMix}>業{m.業法}権{m.権利}{'\n'}法{m.法令}税{m.税他}</Text>
            </View>
          ))}
        </View>
        <Btn ctx={ctx} primary label={`第${r + 1}回を始める（10問・10分）`} onPress={() => go({ name: 'exam', qs: buildExam(hist, r), round: r })} />
        <View style={st.rowBetween}>
          <Text style={st.body}>音声で出題</Text>
          <Switch value={p.voice} onValueChange={v => update({ ...p, voice: v })} trackColor={{ true: c.ai }} />
        </View>
        <Text style={st.note}>目安：10問中 8問以上で合格圏、7問は合格ライン上。5回合計で35点が7割、37点以上なら安全圏です。</Text>
      </Card>

      <PassCard ctx={ctx} />

      <Card ctx={ctx}>
        <Text style={st.h2}>分野別10問テスト</Text>
        <Text style={st.note}>1つの分野だけを10問・10分。まだ解いていない問題と前回間違えた問題を優先します。5回セットの記録には入りません。</Text>
        <View style={st.wrapRow}>
          {(() => { const fs = fieldStatsOf(hist); return FIELDS.map(([f, n]) => (
            <Pressable key={f} onPress={() => go({ name: 'exam', qs: buildFieldExam(hist, f), round: 0, field: f })}
              style={({ pressed }) => [st.kpi, { flexBasis: '47%' }, pressed && st.pressed]}>
              <Text style={st.bold}>{n}</Text>
              <Text style={st.note}>{fs[f].n ? `${Math.round((fs[f].c / fs[f].n) * 100)}%` : '未着手'}　{fs[f].q}/{fs[f].tot}問</Text>
            </Pressable>
          )); })()}
        </View>
      </Card>

      <Card ctx={ctx}>
        <Text style={st.h2}>今の実力</Text>
        <View style={st.kpis}>
          <Kpi ctx={ctx} label="正答率" value={rate == null ? '—' : `${rate}%`} />
          <Kpi ctx={ctx} label="解いた問題" value={`${done} / ${BANK.length}`} />
          {FIELDS.map(([f, n]) => {
            let a = 0, cc = 0;
            BANK.forEach(q => { if (q.f === f) { const h = hist[q.k]; if (h) { a += h.n; cc += h.c; } } });
            return <Kpi key={f} ctx={ctx} label={n} value={a ? `${Math.round((cc / a) * 100)}%` : '—'} />;
          })}
        </View>
        {weak.length > 0 && (
          <Btn ctx={ctx} label={`要復習の論点（${weak.length}件）を解説から復習`} onPress={() => go({ name: 'lesson', queue: weak.map(s => ({ key: `${s.f}|${s.t}` })) })} />
        )}
      </Card>

      {p.log.length > 0 && (
        <Card ctx={ctx}>
          <Text style={st.h2}>模試の履歴</Text>
          {p.log.slice(-10).reverse().map(x => (
            <View key={x.at} style={st.histRow}>
              <Text style={st.note}>{x.at.slice(5, 10).replace('-', '/')} {x.at.slice(11, 16)}</Text>
              <Text style={st.note}>{x.field ? fieldName(x.field) : `第${x.round}回`}</Text>
              <Text style={st.bold}>{x.score} / 10</Text>
              <Text style={st.note}>{Math.floor(x.sec / 60)}分{x.sec % 60}秒</Text>
            </View>
          ))}
        </Card>
      )}

      <Card ctx={ctx}>
        <Text style={st.h2}>論点マップ</Text>
        <Text style={st.note}>押すと、その論点の解説と確認例題3問。赤＝要復習／黄＝習得中／緑＝習得／無色＝未着手</Text>
        {FIELDS.map(([f, n]) => (
          <View key={f} style={{ gap: 6 }}>
            <Text style={st.h3}>{n}</Text>
            <View style={st.wrapRow}>
              {ts.filter(s => s.f === f).map(s => {
                const k = topicState(s);
                return (
                  <Pressable key={s.t} onPress={() => go({ name: 'lesson', queue: [{ key: `${s.f}|${s.t}` }] })}
                    style={({ pressed }) => [st.chip, { borderColor: stateColor[k], backgroundColor: stateBg[k] }, pressed && st.pressed]}>
                    <Text style={st.chipText}>{s.t}{s.n ? ` ${Math.round((s.c / s.n) * 100)}%` : ''}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </Card>

      <Card ctx={ctx}>
        <View style={st.wrapRow}>
          <Btn ctx={ctx} label="セットを第1回からやり直す" onPress={() => update({ ...p, set: { round: 0, scores: [] } })} />
          <Btn ctx={ctx} label="学習記録をすべて消す" onPress={() => setConfirm(true)} />
        </View>
        {confirm && (
          <View style={st.confirm}>
            <Text style={st.body}>解いた記録と正答率がすべて消えます。</Text>
            <View style={st.wrapRow}>
              <Btn ctx={ctx} label="消す" onPress={() => { update({ ...emptyProgress(), voice: p.voice }); setConfirm(false); }} />
              <Btn ctx={ctx} label="やめる" onPress={() => setConfirm(false)} />
            </View>
          </View>
        )}
        <Text style={st.note}>学習記録はこの端末に保存されます。問題は各論点を○×形式で確認するもので、出典は「年度-問-肢」で表示します。</Text>
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
const fieldStatsOf = fieldStats;
function PassCard({ ctx }: { ctx: Ctx }) {
  const { c, st, p, go } = ctx;
  const P = useMemo(() => passEstimate(p.hist), [p.hist]);
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
      <Text style={st.body}>予想得点 <Text style={st.bold}>{Math.round(P.mean)}点</Text> / 50（8割の確率で {P.lo}〜{P.hi}点）　合格ライン {PASS_LINE}点</Text>
      {FIELDS.map(([f, n]) => {
        const s = P.st[f]; const e = P.exp[f];
        return (
          <View key={f} style={[st.passRow, f === P.focus && { backgroundColor: c.warnSoft }]}>
            <Text style={[st.bold, { width: 92 }]}>{n}</Text>
            <Text style={[st.note, { width: 44 }]}>{s.n ? `${Math.round((s.c / s.n) * 100)}%` : '—'}</Text>
            <Text style={[st.note, { width: 64 }]}>{e.toFixed(1)}/{EXAM_N[f]}</Text>
            <View style={[st.barBg, { flex: 1 }]}><View style={[st.barFg, { width: `${Math.round((e / EXAM_N[f]) * 100)}%` }]} /></View>
          </View>
        );
      })}
      <Btn ctx={ctx} primary label={`いちばん伸ばせる「${fieldName(P.focus)}」の10問テスト`}
        onPress={() => go({ name: 'exam', qs: buildFieldExam(p.hist, P.focus), round: 0, field: P.focus })} />
      <Text style={st.note}>これまでの全回答（{P.total}回）から本試験50問（業20・権14・法8・税8）の得点を3,000回シミュレーションした目安。○×は4択より当てやすいため正答率を控えめに換算（正答率^1.5）。登録講習の5問免除は考慮していません。合格を保証するものではありません。</Text>
    </Card>
  );
}

/* ---------- 試験 ---------- */
function Exam({ ctx, qs, round, field }: { ctx: Ctx; qs: Q[]; round: number; field?: Q['f'] }) {
  const { c, st, p, update, go, speak } = ctx;
  const [ans, setAns] = useState<Ans[]>(() => qs.map(() => null));
  const [cur, setCur] = useState(0);
  const [left, setLeft] = useState(LIMIT);
  const [ask, setAsk] = useState(false);
  const start = useRef(Date.now());
  const finished = useRef(false);
  const ansRef = useRef(ans);
  ansRef.current = ans;

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const used = Math.min(LIMIT, Math.round((Date.now() - start.current) / 1000));
    if (field) {
      const r = finishFieldExam(p, field, qs, ansRef.current, used);
      update(r.next);
      go({ name: 'result', qs, ans: ansRef.current, score: r.score, round: 0, used, setScores: null, field });
      return;
    }
    const r = finishExam(p, qs, ansRef.current, used);
    update(r.next);
    go({ name: 'result', qs, ans: ansRef.current, score: r.score, round: r.round, used, setScores: r.setScores });
  }, [p, qs, update, go, field]);

  // 経過時間は開始時刻から計算（バックグラウンドに行ってもずれない）
  useEffect(() => {
    const id = setInterval(() => {
      const l = LIMIT - Math.floor((Date.now() - start.current) / 1000);
      setLeft(Math.max(0, l));
      if (l <= 0) { clearInterval(id); finish(); }
    }, 500);
    return () => clearInterval(id);
  }, [finish]);

  useEffect(() => { if (p.voice) speak(qs[cur].s); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = qs[cur];
  const choose = (v: 0 | 1) => {
    Haptics.selectionAsync().catch(() => {});
    const next = [...ans]; next[cur] = v; setAns(next);
    if (cur < qs.length - 1) setCur(cur + 1);
  };
  const tryFinish = () => { if (ans.some(a => a == null)) setAsk(true); else finish(); };
  const un = ans.filter(a => a == null).length;

  return (
    <>
      <View style={st.rowBetween}>
        <View>
          <Text style={st.note}>{field ? `${fieldName(field)} 10問` : `第${round + 1}回`}　{qs.length - un}/{qs.length}問 回答済み</Text>
          <Text style={[st.timer, left <= 60 && { color: c.ng }]}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text>
        </View>
        <Btn ctx={ctx} label="採点する" onPress={tryFinish} />
      </View>
      <View style={st.dots}>
        {qs.map((_, k) => (
          <Pressable key={k} onPress={() => setCur(k)} accessibilityLabel={`${k + 1}問目`}
            style={[st.dot, ans[k] != null && { backgroundColor: c.aiSoft, borderColor: c.ai }, k === cur && { borderColor: c.ink, borderWidth: 2 }]}>
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
        <Text style={st.meta}>問{cur + 1}　{fieldName(q.f)}</Text>
        <Text style={st.stmt}>{q.s}</Text>
        <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="読み上げ" onPress={() => speak(q.s)} /></View>
        <View style={st.ox}>
          <View style={{ flex: 1 }}><Btn ctx={ctx} big label="○" selected={ans[cur] === 1} onPress={() => choose(1)} /></View>
          <View style={{ flex: 1 }}><Btn ctx={ctx} big label="×" selected={ans[cur] === 0} onPress={() => choose(0)} /></View>
        </View>
        <View style={st.rowBetween}>
          <Btn ctx={ctx} label="前へ" disabled={cur === 0} onPress={() => setCur(cur - 1)} />
          <Btn ctx={ctx} label={cur < qs.length - 1 ? '次へ' : '採点する'} onPress={() => (cur < qs.length - 1 ? setCur(cur + 1) : tryFinish())} />
        </View>
      </Card>
    </>
  );
}

/* ---------- 結果 ---------- */
function Result({ ctx, s }: { ctx: Ctx; s: Extract<Screen, { name: 'result' }> }) {
  const { st, p, go } = ctx;
  const j = judge(s.score);
  const wrong = wrongTopics(s.qs, s.ans);
  const tot = s.setScores ? s.setScores.reduce((a, b) => a + b, 0) : 0;
  const sj = judgeSet(tot);
  return (
    <>
      <Card ctx={ctx}>
        <Text style={st.h2}>{s.field ? `${fieldName(s.field)} 10問の結果` : `第${s.round + 1}回の結果`}</Text>
        <View style={st.row}>
          <Text style={st.big}>{s.score}<Text style={st.bigUnit}> / 10</Text></Text>
          <JudgeTag ctx={ctx} {...j} />
        </View>
        <Text style={st.note}>かかった時間 {Math.floor(s.used / 60)}分{s.used % 60}秒 / 10分</Text>
        {wrong.length ? (
          <>
            <Text style={st.note}>間違えた論点ごとに「解説 → 付随する論点 → 確認例題3問」の順で復習します。</Text>
            <Btn ctx={ctx} primary label={`間違えた${wrong.length}論点を復習する`} onPress={() => go({ name: 'lesson', queue: wrong })} />
            <View style={st.wrapRow}>
              {wrong.map(w => <Btn key={w.key} ctx={ctx} label={`${w.key.split('|')[1]}だけ`} onPress={() => go({ name: 'lesson', queue: [w] })} />)}
            </View>
          </>
        ) : <Text style={st.body}>全問正解です。次の回に進みましょう。</Text>}
        <View style={st.wrapRow}>
          <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
          {s.field
            ? <Btn ctx={ctx} label={`もう一度 ${fieldName(s.field)} 10問`} onPress={() => go({ name: 'exam', qs: buildFieldExam(p.hist, s.field!), round: 0, field: s.field })} />
            : <Btn ctx={ctx} label={`第${p.set.round + 1}回へ進む`} onPress={() => go({ name: 'exam', qs: buildExam(p.hist, p.set.round), round: p.set.round })} />}
        </View>
      </Card>
      {s.setScores && (
        <Card ctx={ctx}>
          <Text style={st.h2}>5回セットの合計（本試験1回分）</Text>
          <View style={st.row}>
            <Text style={st.big}>{tot}<Text style={st.bigUnit}> / 50</Text></Text>
            <JudgeTag ctx={ctx} {...sj} />
          </View>
          <Text style={st.note}>{s.setScores.map((x, k) => `第${k + 1}回 ${x}点`).join('　')}</Text>
        </Card>
      )}
      {s.qs.map((q, k) => (
        <Card key={q.k} ctx={ctx}>
          <Text style={st.meta}>問{k + 1}　{q.t}　{refLabel(q)}</Text>
          <Text style={st.stmt}>{q.s}</Text>
          <Explain ctx={ctx} q={q} your={s.ans[k]} ok={s.ans[k] === q.a} />
        </Card>
      ))}
    </>
  );
}

/* ---------- 復習：解説 → 付随論点 ---------- */
function LessonView({ ctx, queue }: { ctx: Ctx; queue: ReviewItem[] }) {
  const { c, st, p, go, speak } = ctx;
  const item = queue[0];
  const [f, t] = item.key.split('|');
  const L = LESSON[item.key] || { pts: [], traps: [], rel: [] };
  useEffect(() => {
    if (!p.voice) return;
    const h = L.sys ? relatedBranch(L.sys, item.missed?.q) : { branch: -1 };
    if (L.sys && h.branch >= 0) speak(`${t}、${L.sys.tree[h.branch].h}。${L.sys.tree[h.branch].items.join('。')}`);
    else if (L.pts.length) speak(`${t}の要点。${L.pts.slice(0, 4).join('。')}`);
  }, [item.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <View style={st.rowBetween}>
        <View>
          <Text style={st.note}>復習　残り{queue.length}論点</Text>
          <Text style={st.bold}>{t}</Text>
        </View>
        <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
      </View>
      {item.missed && (
        <Card ctx={ctx}>
          <Text style={st.meta}>あなたが間違えた問題　{refLabel(item.missed.q)}</Text>
          <Text style={st.stmt}>{item.missed.q.s}</Text>
          <Explain ctx={ctx} q={item.missed.q} your={item.missed.your} ok={false} />
        </Card>
      )}
      <FocusView ctx={ctx} k={item.key} missed={item.missed?.q} />
      <Btn ctx={ctx} primary label="確認例題3問へ"
        onPress={() => go({ name: 'check', item, rest: queue.slice(1), qs: checkQuestions(p.hist, item.key, item.missed?.q) })} />
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
        <Text style={st.meta}>要点のまとめ　{fieldName(s.key.split('|')[0] as Q['f'])}</Text>
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
function Check({ ctx, item, rest, qs }: { ctx: Ctx; item: ReviewItem; rest: ReviewItem[]; qs: Q[] }) {
  const { st, p, update, go, speak } = ctx;
  const [k, setK] = useState(0);
  const [right, setRight] = useState(0);
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  const t = item.key.split('|')[1];
  const pRef = useRef(p);
  pRef.current = p;

  useEffect(() => { if (p.voice && k < qs.length) speak(qs[k].s); }, [k]); // eslint-disable-line react-hooks/exhaustive-deps

  if (k >= qs.length) {
    const ok = right === qs.length;
    return (
      <Card ctx={ctx}>
        <Text style={st.h2}>{t}　確認例題の結果</Text>
        <View style={st.row}>
          <Text style={st.big}>{right}<Text style={st.bigUnit}> / {qs.length}</Text></Text>
          <JudgeTag ctx={ctx} tone={ok ? 'ok' : right >= 2 ? 'mid' : 'ng'} label={ok ? '習得' : right >= 2 ? 'もう一息' : '要復習'} />
        </View>
        <Text style={st.note}>{ok ? 'この論点は理解できています。' : 'もう一度、解説を読んでから別の3問に挑戦できます。'}</Text>
        <View style={st.wrapRow}>
          {!ok && <Btn ctx={ctx} label="解説に戻ってもう一度" onPress={() => go({ name: 'lesson', queue: [item, ...rest] })} />}
          {rest.length
            ? <Btn ctx={ctx} primary label={`次の論点へ（残り${rest.length}）`} onPress={() => go({ name: 'lesson', queue: rest })} />
            : <Btn ctx={ctx} primary label={`第${p.set.round + 1}回の模試へ`} onPress={() => go({ name: 'exam', qs: buildExam(p.hist, p.set.round), round: p.set.round })} />}
          <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
        </View>
      </Card>
    );
  }

  const q = qs[k];
  const answer = (v: 0 | 1) => {
    if (picked != null) return;
    const ok = v === q.a;
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    setPicked(v);
    if (ok) setRight(right + 1);
    update({ ...pRef.current, hist: rec(pRef.current.hist, q, ok) });
    if (p.voice) speak(`${ok ? '正解。' : '不正解。'}答えは${q.a ? 'まる' : 'ばつ'}。${q.e}`);
  };
  return (
    <>
      <View style={st.rowBetween}>
        <View>
          <Text style={st.note}>確認例題　{k + 1} / {qs.length}　正解 {right}</Text>
          <Text style={st.bold}>{t}</Text>
        </View>
        <Btn ctx={ctx} label="ホームへ" onPress={() => go({ name: 'home' })} />
      </View>
      <Card ctx={ctx}>
        <Text style={st.meta}>{refLabel(q)}</Text>
        <Text style={st.stmt}>{q.s}</Text>
        <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="読み上げ" onPress={() => speak(q.s)} /></View>
        <View style={st.ox}>
          <View style={{ flex: 1 }}><Btn ctx={ctx} big label="○" disabled={picked != null} selected={picked === 1} onPress={() => answer(1)} /></View>
          <View style={{ flex: 1 }}><Btn ctx={ctx} big label="×" disabled={picked != null} selected={picked === 0} onPress={() => answer(0)} /></View>
        </View>
        {picked != null && (
          <>
            <Explain ctx={ctx} q={q} ok={picked === q.a} />
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
    h2: { fontFamily: fonts.disp, fontWeight: '700', fontSize: 18, color: c.ink },
    h3: { fontFamily: fonts.body, fontWeight: '700', fontSize: 14, color: c.muted },
    sub: { fontFamily: fonts.body, fontSize: 13, color: c.muted, lineHeight: 20 },
    body: { fontFamily: fonts.body, fontSize: 15, color: c.ink, lineHeight: 25 },
    li: { fontFamily: fonts.body, fontSize: 15, color: c.ink, lineHeight: 25 },
    bold: { fontFamily: fonts.body, fontSize: 15, color: c.ink, fontWeight: '700' },
    note: { fontFamily: fonts.body, fontSize: 13, color: c.muted, lineHeight: 20 },
    memo: { fontFamily: fonts.body, fontSize: 14, color: c.ink, lineHeight: 22 },
    meta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, fontWeight: '700' },
    stmt: { fontFamily: fonts.body, fontSize: 17, color: c.ink, lineHeight: 29 },
    card: { backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 16, gap: 12 },
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
    dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between' },
    dot: { width: 31, height: 31, borderRadius: 16, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.paper },
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
