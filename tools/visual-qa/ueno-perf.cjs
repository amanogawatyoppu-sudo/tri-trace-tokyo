// Draw calls / triangles / memory / frame time at fixed Ueno spots (and one spot in each other reforged district, to compare), tier 0, 1366x768.
const { start, wait } = require('./start9.cjs');
const base = process.argv[2], tag = process.argv[3];
const SPOTS = [['promenade', 2250, -3700, 0, -1], ['grove', 2000, -3740, 0, -1], ['stairFoot', 2800, -3340, 0, -1], ['point', 2750, -4089, 0, 1], ['canopy', 2250, -4450, 1, 0], ['eastLawn', 3110, -3800, 0, 1], ['akihabara', 2222, -2540, 0, -1], ['shibuya', -2750, 1950, 0, -1], ['shinjuku', -2880, -1450, 0, -1]];
(async () => {
  const { browser, p, errs } = await start({ base, deal: 'moon,ranger', tier: process.env.TIER ?? '1' });
  const S = (f, a) => p.evaluate(f, a);
  const rows = [];
  for (const t of [9000, 291000]) for (const [n, x, z, fx, fz] of SPOTS) {
    await S(([x, z, fx, fz, t]) => { const g = window.__sangoku; g.setTime(t); g.teleport(x, z); g.face(fx, fz); }, [x, z, fx, fz, t]);
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
