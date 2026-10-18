// 試験ごとの別アプリ（バリアント）の設定を、src/exams.ts の EXAMS から作る: npm run variants
// - variants.json   … アプリ名・バンドルID・課金アイテムID（app.config.ts とアプリ本体が読む）
// - eas.json        … 試験ごとのビルド／提出プロファイル（EXPO_PUBLIC_EXAM で試験を指定）
// App Store Connect の「Apple ID」（数字）は variants.json の ascAppId に手で入れる。再生成しても消えない。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXAMS } from '../src/exams';

export type Variant = { name: string; bundleId: string; sku: string; ascAppId: string };

// 宅建は登録済みのバンドルIDを維持。ほかは jp.icurate.tenmin.<試験ID>
export const bundleIdOf = (id: string) => (id === 'takken' ? 'jp.icurate.takkenmock' : `jp.icurate.tenmin.${id}`);
// 課金アイテムIDは英数字・ピリオド・下線のみ（ハイフン不可）
export const skuOf = (id: string) => `${bundleIdOf(id).replace(/-/g, '_')}.full`;
// ストアのアプリ名（30字以内）。「宅建10分模試」の形（App Store Connect の登録名とそろえる）
export const appNameOf = (id: string, name: string, short: string) =>
  id === 'eitango' ? '英単語3500・英検5級〜準1級' : id === 'jukugo' ? '英熟語1500・英検5級〜準1級' : id === 'chugokugo' ? '中国語単語1200・HSK1〜4級' : id === 'futsugo' ? 'フランス語単語2000・仏検5級〜2級' // 模試ではなく単語帳なので「10分模試」を付けない
    : `${(id === 'takken' ? short : name).replace(/\s+/g, '')}10分模試`;

export function buildVariants(prev: Record<string, Variant> = {}): Record<string, Variant> {
  return Object.fromEntries(EXAMS.map(x => [x.id, {
    name: appNameOf(x.id, x.name, x.short),
    bundleId: bundleIdOf(x.id),
    sku: skuOf(x.id),
    ascAppId: prev[x.id]?.ascAppId ?? '',
  }]));
}

if (process.argv[1]?.endsWith('variants.ts')) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let prev: Record<string, Variant> = {};
  try { prev = JSON.parse(readFileSync(root + 'variants.json', 'utf8')); } catch {}
  const v = buildVariants(prev);
  writeFileSync(root + 'variants.json', JSON.stringify(v, null, 2) + '\n');

  const eas = JSON.parse(readFileSync(root + 'eas.json', 'utf8'));
  const keep = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !(k in v)));
  eas.build = keep(eas.build);
  eas.submit = keep(eas.submit ?? {});
  for (const id of Object.keys(v)) {
    eas.build[id] = { extends: 'production', env: { EXPO_PUBLIC_EXAM: id } };
    if (v[id].ascAppId) eas.submit[id] = { ios: { ascAppId: v[id].ascAppId } };
  }
  writeFileSync(root + 'eas.json', JSON.stringify(eas, null, 2) + '\n');
  console.log(`OK: ${Object.keys(v).length}アプリ分の設定を variants.json と eas.json に書き出しました`);
}
