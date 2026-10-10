// 学習記録の保存（端末内）。記録は試験ごとに別キー（Exam.storageKey）で持つ。
// 宅建は従来のキー tkm-progress-v2 のままなので、これまでの記録がそのまま読める。
// 将来クラウド同期を足すときはここに push/pull を追加する。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXAM, Exam, ExamId, byKey } from './exams';
import { emptyProgress, Progress } from './logic';

const LAST_EXAM = 'exam-last-v1';

export async function loadProgress(x: Exam = EXAM.takken): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(x.storageKey);
    if (!raw) return emptyProgress();
    const d = JSON.parse(raw);
    const base = emptyProgress();
    // 問題が差し替わっても壊れないよう、存在する問題の記録だけ残す
    const keys = byKey(x);
    const hist = Object.fromEntries(Object.entries(d.hist || {}).filter(([k]) => keys[k]));
    return {
      ...base,
      hist: hist as Progress['hist'],
      set: d.set && Array.isArray(d.set.scores) ? d.set : base.set,
      log: Array.isArray(d.log) ? d.log : [],
      voice: !!d.voice,
    };
  } catch {
    return emptyProgress();
  }
}

export async function saveProgress(p: Progress, x: Exam = EXAM.takken): Promise<void> {
  try {
    await AsyncStorage.setItem(x.storageKey, JSON.stringify(p));
  } catch {
    // 保存に失敗しても学習は続けられるようにする
  }
}

export async function clearProgress(x: Exam = EXAM.takken): Promise<void> {
  try { await AsyncStorage.removeItem(x.storageKey); } catch {}
}

// 最後に選んだ試験（入口の画面で使う）
export async function loadLastExam(): Promise<ExamId | null> {
  try {
    const v = await AsyncStorage.getItem(LAST_EXAM);
    return v && v in EXAM ? (v as ExamId) : null;
  } catch {
    return null;
  }
}

export async function saveLastExam(id: ExamId): Promise<void> {
  try { await AsyncStorage.setItem(LAST_EXAM, id); } catch {}
}
