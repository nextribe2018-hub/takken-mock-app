import { Platform, useColorScheme } from 'react-native';

const light = {
  bg: '#f3f4f1', paper: '#ffffff', ink: '#1f2a2e', muted: '#5d6a6e', line: '#d9ded9',
  ai: '#24476b', aiSoft: '#e3ebf3', ok: '#2f7a4b', okSoft: '#e2f1e7',
  ng: '#b8402c', ngSoft: '#f8e4df', warn: '#9a6b12', warnSoft: '#f6ecd6', or: '#b85a16', orSoft: '#fbe5d3', onAi: '#ffffff',
};
const dark: typeof light = {
  bg: '#141a1d', paper: '#1d2529', ink: '#e7ecea', muted: '#9aa8ab', line: '#33403f',
  ai: '#8fb4d9', aiSoft: '#22324a', ok: '#7cc795', okSoft: '#1f3a2a',
  ng: '#ee8b75', ngSoft: '#40241f', warn: '#e3b65c', warnSoft: '#3a3020', or: '#f0a060', orSoft: '#3f2a1a', onAi: '#141a1d',
};
export type Colors = typeof light;

// 2色を混ぜる（#rrggbb）。t=0でa、t=1でb
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const fonts = {
  disp: Platform.select({ ios: 'Hiragino Mincho ProN', default: 'serif' }),
  body: Platform.select({ ios: 'Hiragino Sans', default: undefined }),
};
