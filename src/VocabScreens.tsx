// 英単語モードの画面。ロジックは src/vocab.ts、記録は src/storage.ts（vocab-progress-v1）。
// 流れ：レベルを選ぶ → 30語を1分で覚える → 1分テスト（正解で+0.5秒）→ 結果（得点＝残り秒＋正解数）
//       → 単語ごとに直近5回の◯✖△と状態（定着／習得中／要再習得）。要再習得の語は次の30語に復習として入る
//       → 300語ごとに要再習得の語で定着テスト
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Colors } from './theme';
import type { Styles } from '../App';
import {
  LEVELS, LEVEL, Level, Word, Question, Result, LevelProgress, VocabProgress, RoundLog,
  MEMO_SEC, TEST_SEC, BONUS_SEC, FIX_EVERY, REVIEW_MAX, HIST_N, emptyLevel, levelOf, ensureOrd, planRound, buildTest,
  finishRound, finishFix, fixDue, fixWords, skipFix, stats, judge, recentOf, statusOf, wordRows, STATUS_LABEL, WordHist, WordStatus,
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
  const start = (id: string) => {
    const cur = levelOf(ctx.p, id);
    const withOrd = ensureOrd(LEVEL[id], cur);   // 初回はランダムな出題順を決めて保存
    if (withOrd !== cur) setLp(id, withOrd);
    go({ name: 'memo', id, words: planRound(LEVEL[id], withOrd).words });
  };
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
// 直近5回の成績（左が古い）。空きは「・」
function Marks({ ctx, h }: { ctx: VCtx; h?: WordHist }) {
  const { c } = ctx;
  const r = recentOf(h);
  const cells = [...Array(Math.max(0, HIST_N - r.length)).fill('e'), ...r.split('')];
  return (
    <Text accessibilityLabel={`直近${r.length}回の成績`} style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>
      {cells.map((ch, i) => (
        <Text key={i} style={{ color: ch === '1' ? c.ok : ch === '0' ? c.ng : ch === '2' ? c.warn : c.line }}>{ch === '1' ? '◯' : ch === '0' ? '✖' : ch === '2' ? '△' : '・'}</Text>
      ))}
    </Text>
  );
}
function StatusTag({ ctx, s }: { ctx: VCtx; s: WordStatus }) {
  const { c } = ctx;
  const [fg, bg] = s === 'fixed' ? [c.ok, c.okSoft] : s === 'redo' ? [c.ng, c.ngSoft] : s === 'new' ? [c.muted, 'transparent'] : [c.warn, c.warnSoft];
  return <Text style={{ fontSize: 11, fontWeight: '700', color: fg, backgroundColor: bg, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 9, overflow: 'hidden' }}>{STATUS_LABEL[s]}</Text>;
}
// 単語ごとの成績（直近5回）。状態で絞り込み
function WordTable({ ctx, level, lp }: { ctx: VCtx; level: Level; lp: LevelProgress }) {
  const { c, st } = ctx;
  const cnt = stats(level, lp).cnt;
  const keys: WordStatus[] = ['redo', 'na', 'mid', 'fixed'];
  const [f, setF] = useState<WordStatus | 'all' | null>(null);
  const cur = f && (f === 'all' || cnt[f]) ? f : (keys.find(k => cnt[k]) ?? 'all');
  const seen = level.words.length - cnt.new;
  const rows = seen ? wordRows(level, lp, cur === 'all' ? undefined : cur) : [];
  const chip = (k: WordStatus | 'all', label: string, n: number) => (
    <Pressable key={k} accessibilityRole="button" disabled={!n} onPress={() => setF(k)}
      style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: cur === k ? c.ai : c.line, backgroundColor: cur === k ? c.ai : c.bg, minHeight: 36, justifyContent: 'center', opacity: n ? 1 : 0.45 }, pressed && st.pressed]}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: cur === k ? c.onAi : c.ink }}>{label} {n}</Text>
    </Pressable>
  );
  return (
    <View style={st.card}>
      <Text style={st.h2}>単語ごとの成績（直近5回）</Text>
      <Text style={st.note}>左が古く右が新しい。◯正解・✖不正解・△時間切れで未回答。直近3回連続◯で「定着」、最新が✖（または✖が◯より多い）と「要再習得」で、次の30語に復習として入ります。</Text>
      {!seen ? <Text style={st.note}>まだ出題していません。</Text> : (
        <>
          <View style={[st.wrapRow, { gap: 6 }]}>
            {keys.map(k => chip(k, STATUS_LABEL[k], cnt[k]))}
            {chip('all', 'すべて', seen)}
          </View>
          {rows.map((x, i) => (
            <View key={x.w.w} style={{ paddingVertical: 6, gap: 2, borderBottomWidth: i < rows.length - 1 ? 0.5 : 0, borderBottomColor: c.line }}>
              <View style={st.rowBetween}><Text style={[st.stmt, st.bold, { flex: 1 }]}>{x.w.w}</Text><StatusTag ctx={ctx} s={x.s} /></View>
              <View style={st.rowBetween}><Text style={[st.note, { flex: 1 }]}>{x.w.m}</Text><Marks ctx={ctx} h={x.h} /></View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
const dateLabel = (at: number) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------- レベル一覧 ---------- */
function Levels({ ctx, go }: { ctx: VCtx; go: (s: VScreen) => void }) {
  const { c, st } = ctx;
  return (
    <>
      <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="‹ 試験を選ぶ" onPress={ctx.exit} /></View>
      <View style={{ gap: 4 }}>
        <Text style={st.h1}>英単語フラッシュ</Text>
        <Text style={st.note}>30語1分で覚えて、1分で答える</Text>
        <Text style={st.sub}>30語を1分で覚えて、1分で意味を答えます。正解するたびに0.5秒延び、得点は「残り秒＋正解数」。30語はランダムな順で選び、要再習得の語を復習として混ぜます。300語ごとに定着テストがあります。</Text>
        <Text style={st.note}>レベルは TOEIC のスコア目安（100点刻み）。英検・高校・大学は参考です。</Text>
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
            <Text style={st.note}>{L.desc}　<Text style={{ color: c.ai }}>参考：{L.ref}</Text></Text>
            <Text style={st.note}>
              定着 {s.cnt.fixed}語・出題済み {L.words.length - s.cnt.new}/{L.words.length}語{s.cnt.redo ? `・要再習得 ${s.cnt.redo}語` : ''}
              {s.rounds ? `\n最高 ${s.best}点・平均 ${s.avg}点・${s.rounds}回` : '\nまだ始めていません'}
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
  const plan = planRound(level, ensureOrd(level, lp));
  const nrev = plan.words.length - plan.fresh;
  const recent = lp.log.slice(-10).reverse();
  return (
    <>
      <View style={{ alignSelf: 'flex-start' }}><Btn ctx={ctx} label="‹ レベル一覧" onPress={() => go({ name: 'levels' })} /></View>
      <View style={{ gap: 4 }}>
        <Text style={st.h1}>{level.name}</Text>
        <Text style={st.sub}>{level.desc}　参考：{level.ref}</Text>
      </View>
      {due && (
        <View style={[st.card, st.cardNow]}>
          <Text style={st.h2}>定着テストの時間です</Text>
          <Text style={st.body}>{lp.learned}語を覚えました。要再習得などの語（{s.wrongCount}語）から最大30語を、暗記なしで1分テストします。</Text>
          <Btn ctx={ctx} primary big label="定着テストを始める" onPress={startFix} />
        </View>
      )}
      <View style={st.card}>
        <Text style={st.h2}>次の30語　{s.cnt.new ? `新しい語 ${plan.fresh}・` : ''}復習 {nrev}</Text>
        <Text style={st.note}>1分で30語を覚える → 1分でテスト。語はランダムな順で選び、要再習得・未回答の語を最大{REVIEW_MAX}語まで復習として混ぜます。</Text>
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
          <View style={st.kpi}><Text style={st.meta}>要再習得</Text><Text style={st.kpiVal}>{s.cnt.redo}</Text></View>
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
      <WordTable ctx={ctx} level={level} lp={lp} />
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
              {!!recentOf(h) && <Marks ctx={ctx} h={h} />}
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
  const wrong = res.filter(r => !r.ok);  // 不正解と時間切れ
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
          <Text style={st.h2}>間違えた・未回答の語 {wrong.length}</Text>
          {wrong.map((r, i) => (
            <View key={r.w.w} style={{ paddingVertical: 6, gap: 2, borderBottomWidth: i < wrong.length - 1 ? 0.5 : 0, borderBottomColor: c.line }}>
              <View style={st.rowBetween}><Text style={[st.stmt, st.bold, { flex: 1 }]}>{r.w.w}</Text><StatusTag ctx={ctx} s={statusOf(lp.hist[r.w.w])} /></View>
              <View style={st.rowBetween}><Text style={[st.note, { flex: 1 }]}>{r.w.m}　{r.answered ? '✖ 不正解' : '△ 時間切れ'}</Text><Marks ctx={ctx} h={lp.hist[r.w.w]} /></View>
            </View>
          ))}
          <Text style={st.note}>△（時間切れ）は不正解に数えず、次の30語で復習として出します。</Text>
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
