// 1分トライアルの全国ランキング（server/api の PHP と通信）。
// サーバーの URL は EXPO_PUBLIC_RANK_URL（例 https://example.com/api）。未設定なら全国ランキングの機能は出さない。
// 端末ごとの匿名IDで記録し、ニックネームは任意。通信に失敗しても学習は続けられる（null を返す）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dir } from './trial';

export const RANK_URL = (process.env.EXPO_PUBLIC_RANK_URL ?? '').replace(/\/$/, '');
export const rankEnabled = () => RANK_URL !== '';

const ID_KEY = 'rank-id-v1';
const NICK_KEY = 'rank-nick-v1';

let cachedId: string | null = null;
export async function deviceId(): Promise<string> {
  if (cachedId) return cachedId;
  try {
    const v = await AsyncStorage.getItem(ID_KEY);
    if (v && /^[0-9a-f]{32}$/.test(v)) return (cachedId = v);
  } catch {}
  const id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  try { await AsyncStorage.setItem(ID_KEY, id); } catch {}
  return (cachedId = id);
}
export async function loadNick(): Promise<string> { try { return (await AsyncStorage.getItem(NICK_KEY)) ?? ''; } catch { return ''; } }
export async function saveNick(n: string): Promise<void> { try { await AsyncStorage.setItem(NICK_KEY, n); } catch {} }

export type RankStats = {
  rank: number | null; total: number; best: number | null; // 各人のベストの中での順位・人数・自分のベスト
  n: number; mu: number | null; sd: number | null;        // 全記録の数・平均・標準偏差（偏差値の元）
  top: { nick: string; score: number; me: boolean }[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!rankEnabled()) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`${RANK_URL}/${path}`, { ...init, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function submitScore(pack: string, lv: string, dir: Dir, t: { n: number; ok: number; remain: number; score: number; sec: number }): Promise<RankStats | null> {
  const id = await deviceId();
  const nick = await loadNick();
  return call<RankStats>('score.php', { method: 'POST', body: JSON.stringify({ id, nick: nick || undefined, pack, lv, dir, ...t }) });
}
export async function fetchRank(pack: string, lv: string, dir: Dir): Promise<RankStats | null> {
  const id = await deviceId();
  const q = new URLSearchParams({ pack, lv, dir, id }).toString();
  return call<RankStats>(`rank.php?${q}`);
}
export async function registerNick(nick: string): Promise<boolean> {
  const id = await deviceId();
  const r = await call<{ nick: string }>('nick.php', { method: 'POST', body: JSON.stringify({ id, nick }) });
  if (r?.nick) { await saveNick(r.nick); return true; }
  return false;
}

// 本物の分布がある（記録が30以上）ときの偏差値。足りなければ null（仮の基準に戻す）
export const liveT = (score: number, s: RankStats | null): number | null =>
  s && s.n >= 30 && s.mu != null && s.sd != null && s.sd > 0 ? Math.round(50 + (10 * (score - s.mu)) / s.sd) : null;
