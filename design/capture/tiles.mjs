import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const OUT = process.argv[2];
const bank = JSON.parse(readFileSync('bank.json', 'utf8'));
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const topics = [...new Set(bank.map(q => q.f + '|' + q.t))];
const hist = {}, r10 = {}; const seen = {};
// 論点ごとに習熟度をばらつかせる（未着手〜100%）
topics.forEach((t, i) => {
  const lvl = [null, 0.3, 0.5, 0.7, 0.9, 1, 1, 0.9][i % 8]; if (lvl == null) return;
  const qs = bank.filter(q => q.f + '|' + q.t === t).slice(0, 10);
  let s = '';
  qs.forEach(q => { let k = `${q.f}|${q.t}|${q.ref}`; seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k += '#' + seen[k]; const ok = rnd() < lvl ? 1 : 0; hist[k] = { n: 1, c: ok, last: ok }; s += ok; });
  r10[t] = s;
});
const prog = { v: 2, hist, set: { round: 2, scores: [8, 9] }, log: [], voice: false, r10 };
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
await p.goto('http://localhost:8093/', { waitUntil: 'networkidle0' });
await p.evaluate(pr => { localStorage.clear(); localStorage.setItem('unlock-v1:takken', '1'); localStorage.setItem('tkm-progress-v2', JSON.stringify(pr)); }, prog);
await p.reload({ waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 1500));
const scrollTo = t => p.evaluate(t => { const el = [...document.querySelectorAll('div')].reverse().find(d => d.childElementCount === 0 && d.textContent.trim().startsWith(t)); el && el.scrollIntoView({ block: 'start' }); }, t);
await scrollTo('論点マップ'); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: OUT + '/map1.png' });
await p.evaluate(() => { const d=[...document.querySelectorAll('div')].find(d=>d.scrollHeight>d.clientHeight+50 && getComputedStyle(d).overflowY!=='visible'); d && (d.scrollTop += 860); });
await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: OUT + '/map2.png' });
await scrollTo('過去問の4択に戻すと'); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: OUT + '/fourrow.png' });
await p.$$eval('[role=button]', es => es.find(e => e.textContent.includes('過去問の4択に戻すと')).click());
await new Promise(r => setTimeout(r, 600)); await p.screenshot({ path: OUT + '/fourscreen.png' });
await b.close();
