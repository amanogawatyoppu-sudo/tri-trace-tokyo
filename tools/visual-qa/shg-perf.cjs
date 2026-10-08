// Draw calls / triangles / memory / frame time at fixed Shinagawa spots (same spots both builds), tier 0, 1366x768.
const { start, wait } = require('./start9.cjs');
const base = process.argv[2], tag = process.argv[3];
const SPOTS = [['boulevard', -1350, 4480, 1, 0], ['deck', -900, 4262, 1, 0, 150], ['arch', -700, 4480, 1, 0], ['forum', -965, 4290, 0, -1], ['plaza', -200, 4480, 1, 0], ['corridor', -1150, 4850, 1, 0]];
(async () => {
  const { browser, p, errs } = await start({ base, deal: 'moon,ranger', tier: process.env.TIER ?? '1' });
  const S = (f, a) => p.evaluate(f, a);
  const rows = [];
  for (const t of [9000, 291000]) for (const [n, x, z, fx, fz, y] of SPOTS) {
    await S(([x, z, fx, fz, t, y]) => { const g = window.__sangoku; g.setTime(t); g.teleport(x, z, y); g.face(fx, fz); }, [x, z, fx, fz, t, y]);
    await wait(2500);
    // 12 frames: median frame time; draw calls / triangles of frames without and with the shadow pass (min / max).
    const r = await S(() => new Promise((res) => { const a = [], c = [], tr = []; let last = performance.now(); const f = () => { const now = performance.now(); a.push(now - last); last = now; const i = window.__sangoku.renderInfo(); c.push(i.calls); tr.push(i.triangles); if (a.length < 13) requestAnimationFrame(f); else { a.shift(); c.shift(); tr.shift(); a.sort((u, v) => u - v); res({ ms: a[6], calls: Math.min(...c), callsShadow: Math.max(...c), triangles: Math.min(...tr), trianglesShadow: Math.max(...tr) }); } }; requestAnimationFrame(f); }));
    const info = await S(() => window.__sangoku.renderInfo());
    rows.push({ spot: n, time: t === 9000 ? 'day' : 'night', ...r, ms: Math.round(r.ms), geometries: info.geometries, textures: info.textures });
  }
  const mem = await S(() => (window.__sangoku.memory ? window.__sangoku.memory() : null));
  console.log(JSON.stringify({ tag, rows, mem, errs }));
  await browser.close();
})();
