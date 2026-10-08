// Draw calls / triangles / memory / frame time at fixed Akihabara spots (same spots both builds), tier 0, 1366x768.
const { start, wait } = require('./start9.cjs');
const base = process.argv[2], tag = process.argv[3];
const SPOTS = [['street', 2222, -2540, 0, -1], ['alley', 1913, -2760, 0, 1], ['service', 2840, -2760, 0, 1], ['junction', 2642, -2400, 0, 1], ['tower', 2380, -2990, 1, 0.2], ['arcade', 2420, -2937, -1, 0]];
(async () => {
  const { browser, p, errs } = await start({ base, deal: 'moon,ranger' });
  const S = (f, a) => p.evaluate(f, a);
  const rows = [];
  for (const t of [9000, 291000]) for (const [n, x, z, fx, fz] of SPOTS) {
    await S(([x, z, fx, fz, t]) => { const g = window.__sangoku; g.setTime(t); g.teleport(x, z); g.face(fx, fz); }, [x, z, fx, fz, t]);
    await wait(2500);
    const ft = await S(() => new Promise((res) => { const a = []; let last = performance.now(); const f = () => { const now = performance.now(); a.push(now - last); last = now; if (a.length < 9) requestAnimationFrame(f); else { a.shift(); a.sort((u, v) => u - v); res(a[Math.floor(a.length / 2)]); } }; requestAnimationFrame(f); }));
    const info = await S(() => window.__sangoku.renderInfo());
    rows.push({ spot: n, time: t === 9000 ? 'day' : 'night', ms: Math.round(ft), ...info });
  }
  const mem = await S(() => (window.__sangoku.memory ? window.__sangoku.memory() : null));
  console.log(JSON.stringify({ tag, rows, mem, errs }));
  await browser.close();
})();
