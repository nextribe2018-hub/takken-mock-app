import { Platform, useColorScheme } from 'react-native';

const light = {
  bg: '#f3f4f1', paper: '#ffffff', ink: '#1f2a2e', muted: '#5d6a6e', line: '#d9ded9',
  ai: '#24476b', aiSoft: '#e3ebf3', ok: '#2f7a4b', okSoft: '#e2f1e7',
  ng: '#b8402c', ngSoft: '#f8e4df', warn: '#9a6b12', warnSoft: '#f6ecd6', onAi: '#ffffff',
};
const dark: typeof light = {
  bg: '#141a1d', paper: '#1d2529', ink: '#e7ecea', muted: '#9aa8ab', line: '#33403f',
  ai: '#8fb4d9', aiSoft: '#22324a', ok: '#7cc795', okSoft: '#1f3a2a',
  ng: '#ee8b75', ngSoft: '#40241f', warn: '#e3b65c', warnSoft: '#3a3020', onAi: '#141a1d',
};
export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const fonts = {
  disp: Platform.select({ ios: 'Hiragino Mincho ProN', default: 'serif' }),
  body: Platform.select({ ios: 'Hiragino Sans', default: undefined }),
};
