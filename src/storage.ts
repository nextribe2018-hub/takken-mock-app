// 学習記録の保存（端末内）。将来クラウド同期を足すときはここに push/pull を追加する。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backfillRecent, BYKEY, emptyProgress, Progress } from './logic';

const KEY = 'tkm-progress-v2';

export async function loadProgress(): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const d = JSON.parse(raw);
    const base = emptyProgress();
    // 問題が差し替わっても壊れないよう、存在する問題の記録だけ残す
    const hist = Object.fromEntries(Object.entries(d.hist || {}).filter(([k]) => BYKEY[k]));
    return {
      ...base,
      hist: hist as Progress['hist'],
      r10: backfillRecent(hist as Progress['hist'], d.r10 && typeof d.r10 === 'object' ? d.r10 : {}),
      set: d.set && Array.isArray(d.set.scores) ? d.set : base.set,
      log: Array.isArray(d.log) ? d.log : [],
      voice: !!d.voice,
    };
  } catch {
    return emptyProgress();
  }
}

export async function saveProgress(p: Progress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 保存に失敗しても学習は続けられるようにする
  }
}

export async function clearProgress(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
