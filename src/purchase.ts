// 買い切り課金（非消耗型）。expo-iap（StoreKit 2）を使う。
// Expo Go と Web にはネイティブの課金機能がないので、そこでは「購入できない」として動く（アプリは落ちない）。
import { Platform } from 'react-native';

type Iap = typeof import('expo-iap');
let iap: Iap | null = null;
if (Platform.OS !== 'web') {
  try { iap = require('expo-iap'); } catch { iap = null; }
}

export type StoreState = { available: boolean; price: string | null };
export type PurchaseEvents = { onUnlocked: (sku: string) => void; onError: (message: string) => void };

let connected = false;
let subs: { remove: () => void }[] = [];

// 接続して価格を取り、購入済みなら onUnlocked を呼ぶ。購入結果は onUnlocked／onError で届く
export async function startStore(skus: string[], ev: PurchaseEvents): Promise<Record<string, StoreState>> {
  const none = Object.fromEntries(skus.map(s => [s, { available: false, price: null }]));
  if (!iap || !skus.length) return none;
  try {
    if (!connected) { await iap.initConnection(); connected = true; }
    subs.forEach(s => s.remove());
    subs = [
      iap.purchaseUpdatedListener(async p => {
        if (!skus.includes(p.productId)) return;
        try { await iap!.finishTransaction({ purchase: p, isConsumable: false }); } catch {}
        ev.onUnlocked(p.productId);
      }),
      iap.purchaseErrorListener(e => {
        if (iap!.isUserCancelledError(e)) return;
        ev.onError(iap!.getUserFriendlyErrorMessage(e) || '購入を完了できませんでした。');
      }),
    ];
    const products = (await iap.fetchProducts({ skus, type: 'in-app' })) ?? [];
    const out: Record<string, StoreState> = { ...none };
    products.forEach(p => { if ('displayPrice' in p) out[p.id] = { available: true, price: p.displayPrice }; });
    await checkOwned(skus, ev.onUnlocked);
    return out;
  } catch {
    return none;
  }
}

async function checkOwned(skus: string[], onUnlocked: (sku: string) => void) {
  if (!iap) return;
  const owned = await iap.getAvailablePurchases();
  owned.forEach(p => { if (skus.includes(p.productId)) onUnlocked(p.productId); });
}

export async function buy(sku: string): Promise<void> {
  if (!iap) throw new Error('この環境では購入できません（App Store 版のアプリで購入してください）');
  await iap.requestPurchase({ request: { apple: { sku }, google: { skus: [sku] } }, type: 'in-app' });
}

// 「購入を復元」：Apple の購入記録を同期して、購入済みのものを解放する。見つかった数を返す
export async function restore(skus: string[], onUnlocked: (sku: string) => void): Promise<number> {
  if (!iap) throw new Error('この環境では復元できません（App Store 版のアプリで復元してください）');
  await iap.restorePurchases();
  let n = 0;
  await checkOwned(skus, s => { n++; onUnlocked(s); });
  return n;
}
