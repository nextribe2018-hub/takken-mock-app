// いま動いているアプリがどの試験か（EXPO_PUBLIC_EXAM はビルド時に埋め込まれる）。
// 未指定（開発用）なら全試験を入口で選べる。
import variants from '../variants.json';
import { EXAM, EXAMS, Exam, ExamId } from './exams';

type Variant = { name: string; bundleId: string; sku: string; ascAppId: string };
const VARIANTS = variants as Record<string, Variant>;

const fixed = process.env.EXPO_PUBLIC_EXAM as ExamId | undefined;
export const SINGLE: Exam | null = fixed && EXAM[fixed] ? EXAM[fixed] : null;
export const APP_EXAMS: Exam[] = SINGLE ? [SINGLE] : EXAMS;
export const skuFor = (id: ExamId) => VARIANTS[id]?.sku ?? '';
export const PRICE_LABEL = '400円'; // 表示用の目安。実際の価格はストアから取得したものを優先
