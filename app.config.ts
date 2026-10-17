// 試験ごとの別アプリ：EXPO_PUBLIC_EXAM=<試験ID> でビルドすると、その試験だけのアプリになる
// （名前・バンドルIDは variants.json。`npm run variants` で src/exams.ts から作る）。
// 指定しないときは全試験を入口で選べる開発用。
// 注意：name は Xcode のプロジェクト名にも使われ、日本語だけだと英数字が残らず（例「10」）ビルドが失敗する。
// そのため name は英数字にし、ホーム画面に出る日本語名は CFBundleDisplayName で付ける。
import { ConfigContext, ExpoConfig } from 'expo/config';
import variants from './variants.json';

const pascal = (id: string) => id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');

export default ({ config }: ConfigContext): ExpoConfig => {
  const id = process.env.EXPO_PUBLIC_EXAM;
  const v = id ? (variants as Record<string, { name: string; bundleId: string }>)[id] : undefined;
  if (id && !v) throw new Error(`EXPO_PUBLIC_EXAM=${id} は variants.json にありません（npm run variants を実行）`);
  const displayName = v?.name ?? '10分模試';
  return {
    ...config,
    name: id ? `Tenmin${pascal(id)}` : 'TenminMock',
    ios: {
      ...config.ios,
      ...(v && { bundleIdentifier: v.bundleId }),
      infoPlist: { ...config.ios?.infoPlist, CFBundleDisplayName: displayName },
    },
    android: { ...config.android, ...(v && { package: v.bundleId.replace(/-/g, '_') }) },
  } as ExpoConfig;
};
