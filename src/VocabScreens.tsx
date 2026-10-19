// 英単語モードの画面。ロジックは src/vocab.ts、記録は src/storage.ts（vocab-progress-v1）。
// 流れ：レベルを選ぶ → 30語を1分で覚える → 1分テスト（正解で+0.5秒）→ 結果（得点＝残り秒＋正解数）
//       → 300語ごとに「過去に間違えた語だけ」で定着テスト
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Colors } from './theme';
import type { Styles } from '../App';
import {
  LEVELS, LEVEL, Level, Word, Question, Result, LevelProgress, VocabProgress, RoundLog,
  MEMO_SEC, TEST_SEC, BONUS_SEC, ROUND_SIZE, FIX_EVERY, emptyLevel, levelOf, nextWords, buildTest, scoreOf,
  finishRound, finishFix, fixDue, fixWords, skipFix, stats, judge,
} from './vocab';

type VScreen =
  | { name: 'levels' }
  | { name: 'level'; id: string }
  | { name: 'memo'; id: string; words: Word[]; repeat?: boolean }
  | { name: 'test'; id: string; words: Word[]; kind: 'round' | 'fix'; repeat?: boolean }
  | { name: 'result'; id: string; words: Word[]; res: Result[]; log: RoundLog; fixDue: boolean };

export type VCtx = { c: Colors; st: Styles; p: VocabProgress; update: (p: VocabProgress) => void; exit: () => void; toTop: () => void };

export function VocabApp({ ctx }: { ctx: VCtx }) {
  const [s, setS] = useState<VScreen>({ name: 'levels' });
  const go = useCallback((n: VScreen) => { setS(n); ctx.toTop(); }, [ctx]);
  const lp = 'id' in s ? levelOf(ctx.p, s.id) : emptyLevel();
  const setLp = (id: string, next: LevelProgress) => ctx.update({ ...ctx.p, levels: { ...ctx.p.levels, [id]: next } });
  const start = (id: string) => go({ name: 'memo', id, words: nextWords(LEVEL[id], levelOf(ctx.p, id)) });
  const startFix = (id: string) => {
    const ws = fixWords(LEVEL[id], levelOf(ctx.p, id));
    if (!ws.length) { setLp(id, skipFix(levelOf(ctx.p, id))); go({ name: 'level', id }); return; }
    go({ name: 'test', id, words: ws, kind: 'fix' });
  };

  if (s.name === 'levels') return <Levels ctx={ctx} go={go} />;
  if (s.name === 'level') return <LevelHome ctx={ctx} level={LEVEL[s.id]} lp={lp} go={go} start={() => start(s.id)} startFix={() => startFix(s.id)} reset={() => setLp(s.id, emptyLevel())} />;
  if (s.name === 'memo') return <Memo key={s.words[0].w} ctx={ctx} level={LEVEL[s.id]} lp={lp} words={s.words} onDone={() => go({ name: 'test', id: s.id, words: s.words, kind: 'round', repeat: s.repeat })} />;
  if (s.name === 'test') {
    return (
      <Test key={s.kind + s.words[0].w} ctx={ctx} level={LEVEL[s.id]} words={s.words} kind={s.kind}
        onDone={(res, left) => {
          if (s.kind === 'fix') {
            const r = finishFix(lp, res, left);
            setLp(s.id, r.next);
            go({ name: 'result', id: s.id, words: s.words, res, log: r.log, fixDue: false });
          } else {
            const r = finishRound(lp, LEVEL[s.id], res, left, !!s.repeat);
            setLp(s.id, r.next);
            go({ name: 'result', id: s.id, words: s.words, res, log: r.log, fixDue: r.fixDue });
          }
        }} />
    );
  }
  return (
    <ResultView ctx={ctx} s={s} lp={lp}
      again={() => go({ name: 'memo', id: s.id, words: s.words, repeat: true })}
      next={() => start(s.id)} fix={() => startFix(s.id)} home={() => go({ name: 'level', id: s.id })} />
  );
}

/* ---------- 小道具 ---------- */
function Btn({ ctx, label, onPress, primary, disabled, big }: { ctx: VCtx; label: string; onPress: () => void; primary?: boolean; disabled?: boolean; big?: boolean }) {
  const { st } = ctx;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [st.btn, primary && st.btnPri, disabled && st.btnDis, big && { minHeight: 56 }, pressed && st.pressed]}>
      <Text style={[st.btnText, primary && st.btnPriText, big && { fontSize: 17 }]}>{label}</Text>
    </Pressable>
  );
}
const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;
const fmt1 = (sec: number) => Math.max(0, sec).toFixed(1);
const dateLabel = (at: number) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------- レベル一覧 ---------- */
function Levels({ ctx, go }: { ctx: VCtx; go: (s: VScreen) => void }) {
  const { st } = ctx;
  return (
    <>
      <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="‹ 試験を選ぶ" onPress={ctx.exit} /></View>
      <View style={{ gap: 4 }}>
        <Text style={st.h1}>英単語 30語1分</Text>
        <Text style={st.sub}>30語を1分で覚えて、1分で意味を答えます。正解するたびに0.5秒延び、得点は「残り秒＋正解数」。300語ごとに、間違えた語だけの定着テストがあります。</Text>
      </View>
      {LEVELS.map(L => {
        const lp = levelOf(ctx.p, L.id);
        const s = stats(L, lp);
        return (
          <Pressable key={L.id} accessibilityRole="button" onPress={() => go({ name: 'level', id: L.id })}
            style={({ pressed }) => [st.card, pressed && st.pressed]}>
            <View style={st.rowBetween}>
              <Text style={st.h2}>{L.name}</Text>
              {fixDue(lp) && <Text style={st.tag}>定着テスト</Text>}
            </View>
            <Text style={st.note}>{L.desc}</Text>
            <Text style={st.note}>
              {L.words.length}語　覚えた {lp.learned}語（{Math.min(100, Math.round(lp.learned / L.words.length * 100))}%）
              {s.rounds ? `　最高 ${s.best}点・平均 ${s.avg}点・${s.rounds}回` : '　まだ始めていません'}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}

/* ---------- レベルのホーム ---------- */
function LevelHome({ ctx, level, lp, go, start, startFix, reset }: {
  ctx: VCtx; level: Level; lp: LevelProgress; go: (s: VScreen) => void; start: () => void; startFix: () => void; reset: () => void;
}) {
  const { c, st } = ctx;
  const [confirm, setConfirm] = useState(false);
  const s = stats(level, lp);
  const due = fixDue(lp);
  const pos = lp.cursor;
  const lap = Math.floor(lp.learned / level.words.length) + 1;
  const recent = lp.log.slice(-10).reverse();
  return (
    <>
      <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="‹ レベル一覧" onPress={() => go({ name: 'levels' })} /></View>
      <View style={{ gap: 4 }}>
        <Text style={st.h1}>{level.name}</Text>
        <Text style={st.sub}>{level.desc}</Text>
      </View>
      {due && (
        <View style={[st.card, st.cardNow]}>
          <Text style={st.h2}>定着テストの時間です</Text>
          <Text style={st.body}>{lp.learned}語を覚えました。これまでに間違えた語（{s.wrongCount}語）から最大30語を、暗記なしで1分テストします。</Text>
          <Btn ctx={ctx} primary big label="定着テストを始める" onPress={startFix} />
        </View>
      )}
      <View style={st.card}>
        <Text style={st.h2}>{lap}周目　{pos + 1}〜{Math.min(pos + ROUND_SIZE, level.words.length)}語目</Text>
        <Text style={st.note}>1分で30語を覚える → 1分でテスト。{lap > 1 ? '2周目からは間違いの多い語から出ます。' : ''}</Text>
        <Btn ctx={ctx} primary big label="30語を覚える（1分）" onPress={start} disabled={due} />
        {due && <Text style={st.note}>先に定着テストを済ませてください。</Text>}
      </View>
      <View style={st.card}>
        <Text style={st.h2}>記録</Text>
        <View style={st.kpis}>
          <View style={st.kpi}><Text style={st.meta}>最高点</Text><Text style={st.kpiVal}>{s.best}</Text></View>
          <View style={st.kpi}><Text style={st.meta}>平均点</Text><Text style={st.kpiVal}>{s.avg}</Text></View>
          <View style={st.kpi}><Text style={st.meta}>回数</Text><Text style={st.kpiVal}>{s.rounds}</Text></View>
          <View style={st.kpi}><Text style={st.meta}>正解の累計</Text><Text style={st.kpiVal}>{s.totalCorrect}<Text style={st.bigUnit}>/{s.total}</Text></Text></View>
          <View style={st.kpi}><Text style={st.meta}>間違えた語</Text><Text style={st.kpiVal}>{s.wrongCount}</Text></View>
          <View style={st.kpi}><Text style={st.meta}>定着テスト</Text><Text style={st.kpiVal}>{s.fixes}<Text style={st.bigUnit}>{s.fixes ? ` 平均${s.fixAvg}` : ''}</Text></Text></View>
        </View>
        <Text style={st.note}>得点＝残り秒＋正解数（例：残り25秒・28問正解 → 53点）。次の定着テストまで あと{FIX_EVERY - (lp.learned % FIX_EVERY) === FIX_EVERY && !due ? FIX_EVERY : FIX_EVERY - (lp.learned % FIX_EVERY)}語。</Text>
        {recent.length > 0 && (
          <View>
            {recent.map((l, i) => (
              <View key={l.at + '-' + i} style={st.histRow}>
                <Text style={st.note}>{dateLabel(l.at)}　{l.kind === 'fix' ? '定着' : '通常'}</Text>
                <Text style={[st.note, { color: c.ink }]}>{l.score}点　正解{l.correct}/{l.size}　残り{fmt1(l.left)}秒</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {s.wrongCount > 0 && (
        <View style={st.card}>
          <Text style={st.h2}>間違えた語</Text>
          <Text style={st.note}>誤答率の高い順。定着テストはここから出ます。</Text>
          {fixWords(level, lp).map(w => {
            const h = lp.hist[w.w];
            return (
              <View key={w.w} style={st.histRow}>
                <Text style={st.body}><Text style={st.bold}>{w.w}</Text>　{w.m}</Text>
                <Text style={st.note}>{h.c}/{h.n}</Text>
              </View>
            );
          })}
        </View>
      )}
      <View style={{ gap: 8 }}>
        {!confirm ? <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="このレベルの記録を消す" onPress={() => setConfirm(true)} /></View> : (
          <View style={st.confirm}>
            <Text style={st.body}>{level.name}の記録（{lp.log.length}回分）を消します。元に戻せません。</Text>
            <View style={st.wrapRow}>
              <Btn ctx={ctx} primary label="消す" onPress={() => { reset(); setConfirm(false); }} />
              <Btn ctx={ctx} label="やめる" onPress={() => setConfirm(false)} />
            </View>
          </View>
        )}
      </View>
    </>
  );
}

/* ---------- 暗記（1分） ---------- */
function Memo({ ctx, level, lp, words, onDone }: { ctx: VCtx; level: Level; lp: LevelProgress; words: Word[]; onDone: () => void }) {
  const { c, st } = ctx;
  const [left, setLeft] = useState(MEMO_SEC);
  const start = useRef(Date.now());
  const done = useRef(false);
  const finish = useCallback(() => { if (done.current) return; done.current = true; onDone(); }, [onDone]);
  useEffect(() => {
    const id = setInterval(() => {
      const l = MEMO_SEC - (Date.now() - start.current) / 1000;
      setLeft(Math.max(0, l));
      if (l <= 0) { clearInterval(id); finish(); }
    }, 250);
    return () => clearInterval(id);
  }, [finish]);
  return (
    <>
      <View style={st.rowBetween}>
        <View>
          <Text style={st.note}>{level.name}　覚える 30語</Text>
          <Text style={[st.timer, left <= 10 && { color: c.ng }]}>{fmt(Math.ceil(left))}</Text>
        </View>
        <Btn ctx={ctx} primary label="テストへ進む" onPress={finish} />
      </View>
      <View style={st.card}>
        {words.map((w, i) => {
          const h = lp.hist[w.w];
          return (
            <View key={w.w} style={[st.rowBetween, { paddingVertical: 4, borderBottomWidth: i < words.length - 1 ? 0.5 : 0, borderBottomColor: c.line }]}>
              <Text style={[st.stmt, { flex: 1 }]}><Text style={st.bold}>{w.w}</Text></Text>
              <Text style={[st.body, { flex: 1.3 }]}>{w.m}<Text style={st.note}>　{w.p}</Text></Text>
              {h && h.c < h.n && <Text style={[st.note, { color: c.ng }]}>前回×</Text>}
            </View>
          );
        })}
      </View>
      <Text style={st.note}>時間になると自動でテストが始まります。</Text>
    </>
  );
}

/* ---------- テスト（1分、正解で+0.5秒） ---------- */
function Test({ ctx, level, words, kind, onDone }: { ctx: VCtx; level: Level; words: Word[]; kind: 'round' | 'fix'; onDone: (res: Result[], left: number) => void }) {
  const { c, st } = ctx;
  const [qs] = useState<Question[]>(() => buildTest(words, level));
  const [cur, setCur] = useState(0);
  const [left, setLeft] = useState(TEST_SEC);
  const [flash, setFlash] = useState<'ok' | 'ng' | null>(null);
  const start = useRef(Date.now());
  const bonus = useRef(0);
  const res = useRef<Result[]>(qs.map(q => ({ w: q.w, ok: false, answered: false })));
  const done = useRef(false);
  const leftNow = () => TEST_SEC + bonus.current - (Date.now() - start.current) / 1000;
  const finish = useCallback((l: number) => { if (done.current) return; done.current = true; onDone(res.current, l); }, [onDone]);
  useEffect(() => {
    const id = setInterval(() => {
      const l = leftNow();
      setLeft(l);
      if (l <= 0) { clearInterval(id); finish(0); }
    }, 100);
    return () => clearInterval(id);
  }, [finish]);

  const choose = (v: number) => {
    if (done.current) return;
    const q = qs[cur];
    const ok = v === q.a;
    res.current[cur] = { w: q.w, ok, answered: true };
    if (ok) bonus.current += BONUS_SEC;
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    setFlash(ok ? 'ok' : 'ng');
    setTimeout(() => setFlash(null), 250);
    if (cur < qs.length - 1) setCur(cur + 1);
    else finish(leftNow());
  };
  const q = qs[cur];
  const correct = res.current.filter(r => r.ok).length;
  return (
    <>
      <View style={st.rowBetween}>
        <View>
          <Text style={st.note}>{kind === 'fix' ? '定着テスト' : level.name}　{cur + 1}/{qs.length}問　正解 {correct}</Text>
          <Text style={[st.timer, left <= 10 && { color: c.ng }]}>{fmt1(left)}<Text style={st.bigUnit}> 秒</Text></Text>
        </View>
        <Text style={[st.judge, { color: flash === 'ok' ? c.ok : flash === 'ng' ? c.ng : c.muted, backgroundColor: flash === 'ok' ? c.okSoft : flash === 'ng' ? c.ngSoft : 'transparent' }]}>
          {flash === 'ok' ? '正解 +0.5秒' : flash === 'ng' ? '不正解' : ' '}
        </Text>
      </View>
      <View style={st.dots}>
        {qs.map((_, k) => {
          const r = res.current[k];
          return (
            <View key={k} style={[st.dot, { width: 18, height: 18, borderRadius: 9 }, r.answered && (r.ok ? { backgroundColor: c.okSoft, borderColor: c.ok } : { backgroundColor: c.ngSoft, borderColor: c.ng }), k === cur && { borderColor: c.ink, borderWidth: 2 }]} />
          );
        })}
      </View>
      <View style={st.card}>
        <Text style={st.meta}>意味は？　{q.w.p}</Text>
        <Text style={[st.big, { fontFamily: undefined }]}>{q.w.w}</Text>
        <View style={{ gap: 8 }}>
          {q.choices.map((ch, i) => (
            <Pressable key={i} accessibilityRole="button" onPress={() => choose(i)}
              style={({ pressed }) => [st.btn, st.btnLeft, pressed && st.pressed]}>
              <Text style={[st.btnText, st.btnLeftText]}>{i + 1}．{ch}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={st.note}>正解で0.5秒延びます。得点＝残り秒（切り捨て）＋正解数。</Text>
    </>
  );
}

/* ---------- 結果 ---------- */
function ResultView({ ctx, s, lp, again, next, fix, home }: {
  ctx: VCtx; s: Extract<VScreen, { name: 'result' }>; lp: LevelProgress; again: () => void; next: () => void; fix: () => void; home: () => void;
}) {
  const { c, st } = ctx;
  const { log, res } = s;
  const level = LEVEL[s.id];
  const st2 = stats(level, lp);
  const wrong = res.filter(r => !r.ok);
  const isBest = log.kind === 'round' && log.score >= st2.best;
  const j = judge(log.score, log.correct, log.size);
  const tone = log.correct / log.size >= 0.8 ? 'ok' : log.correct / log.size >= 0.6 ? 'mid' : 'ng';
  const map = { ok: [c.ok, c.okSoft], mid: [c.warn, c.warnSoft], ng: [c.ng, c.ngSoft] } as const;
  return (
    <>
      <View style={st.card}>
        <Text style={st.meta}>{log.kind === 'fix' ? '定着テスト' : level.name}　{isBest ? '自己ベスト' : ''}</Text>
        <Text><Text style={st.big}>{log.score}</Text><Text style={st.bigUnit}> 点</Text></Text>
        <Text style={st.body}>残り {fmt1(log.left)}秒 ＋ 正解 {log.correct}問{log.asked < log.size ? `（${log.size - log.asked}問は時間切れ）` : ''}</Text>
        <Text style={[st.judge, { color: map[tone][0], backgroundColor: map[tone][1], alignSelf: 'flex-start' }]}>{j}</Text>
        <Text style={st.note}>この レベルの最高 {st2.best}点・平均 {st2.avg}点（{st2.rounds}回）。覚えた語 {lp.learned}。</Text>
      </View>
      {s.fixDue && (
        <View style={[st.card, st.cardNow]}>
          <Text style={st.h2}>{lp.learned}語を覚えました</Text>
          <Text style={st.body}>これまでに間違えた語だけで、暗記なしの1分テストをして定着を測ります。</Text>
          <Btn ctx={ctx} primary big label="定着テストへ" onPress={fix} />
        </View>
      )}
      {wrong.length > 0 && (
        <View style={st.card}>
          <Text style={st.h2}>間違えた語 {wrong.length}</Text>
          {wrong.map(r => (
            <View key={r.w.w} style={st.histRow}>
              <Text style={st.body}><Text style={st.bold}>{r.w.w}</Text>　{r.w.m}</Text>
              <Text style={st.note}>{r.answered ? '×' : '未回答'}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={st.wrapRow}>
        {!s.fixDue && log.kind === 'round' && <Btn ctx={ctx} primary label="次の30語へ" onPress={next} />}
        {log.kind === 'round' && <Btn ctx={ctx} label="同じ30語をもう一度" onPress={again} />}
        <Btn ctx={ctx} label="ホームへ" onPress={home} />
      </View>
    </>
  );
}
