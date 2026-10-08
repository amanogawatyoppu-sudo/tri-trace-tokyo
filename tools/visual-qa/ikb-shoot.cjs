// Ikebukuro review shots: spots × times (with renderer stats), or the 30 s run along a route.
// OUTDIR=<dir> [ROUTE=<route.json>] node ikb-shoot.cjs <tag> <base-url> <spots|run> [day,sunset,night]
const { chromium } = require('playwright');
const fs = require('fs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const [tag, base, mode = 'spots', timesArg = 'day,sunset,night'] = process.argv.slice(2);
const OUT = process.env.OUTDIR;
const R3 = 281;
const T = { day: 9000, sunset: 150000, night: 291000 };
// [name, x, y, z, dx, dz, tilt?, zoom?]
const SPOTS = [
  ['street', -2575, 0, -4060, 0.15, -1],
  ['network', -2330, R3, -4545, 0.55, 1],
  ['backstair', -1860, 0, -4235, -0.35, -1],
  ['hub', -2110, R3, -4300, -1, 0.35],
  ['garden', -2330, R3, -4235, 0, 1],
  ['roofview', -2042, R3, -4730, -1, 0.35, 0.62],
  ['skyservice', -2030, 0, -5440, 0.1, 1],
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('sangoku.quality.v1', '0'); } catch {} });
  await ctx.addInitScript(() => { let x = 7; Math.random = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(base + '?debug&deal=moon,communicator'); await wait(2000);
  await p.evaluate(() => setTimeout(() => document.getElementById('btnPlay').click(), 10)); await wait(500);
  await p.evaluate(() => setTimeout(() => document.getElementById('btnStart').click(), 10));
  for (let i = 0; i < 240; i++) { if (await p.evaluate(() => !!window.__sangoku && window.__sangoku.screen() === 'PLAYING' && (!document.getElementById('loading') || document.getElementById('loading').hidden))) break; await wait(500); }
  await wait(5000);
  await p.evaluate(() => window.__sangoku.meetingIn(99999));
  // Keep everyone else away from the camera: park the other people far off (they are not the subject).
  const park = () => p.evaluate(() => { const s = window.__sangoku; for (const e of s.people()) if (!e.player) s.place(e.id, 6000, 6000, 0, 1); });
  const rows = [];
  if (mode === 'spots' || mode === 'probe') {
    const times = timesArg.split(',');
    const list = mode === 'probe' ? SPOTS.slice(0, 1) : SPOTS;
    for (const tname of times) {
      for (const [name, x, y, z, dx, dz, tilt] of list) {
        await p.evaluate(([x, y, z, dx, dz, t, tilt]) => { const s = window.__sangoku; s.pause(false); s.setTime(t); s.teleport(x, z, y); s.face(dx, dz); s.tilt(tilt ?? 0.32); }, [x, y, z, dx, dz, T[tname], tilt]);
        await park();
        await wait(3500);
        await p.evaluate(() => window.__sangoku.pause(true));
        await wait(2500);
        const info = await p.evaluate(() => ({ ...window.__sangoku.renderInfo(), ...window.__sangoku.frameStats(), pl: window.__sangoku.player() }));
        await p.screenshot({ path: `${OUT}/${tag}-${name}-${tname}.png` });
        rows.push({ name, time: tname, calls: info.calls, triangles: info.triangles, geometries: info.geometries, textures: info.textures, p50: info.p50, y: Math.round(info.pl.y), x: Math.round(info.pl.x), z: Math.round(info.pl.z) });
      }
    }
    const mem = await p.evaluate(() => window.__sangoku.memory());
    console.log(JSON.stringify({ tag, mem, rows, errs }));
  } else if (mode === 'run') {
    const route = JSON.parse(fs.readFileSync(process.env.ROUTE, 'utf8'));
    await p.evaluate(([x, y, z, t]) => { const s = window.__sangoku; s.setTime(t); s.teleport(x, z, y); s.face(0, -1); s.tilt(0.32); }, [...route[0], T.sunset]);
    await park();
    await wait(3000);
    const t0 = await p.evaluate(() => window.__sangoku.time());
    let k = 1, shot = 0;
    await p.keyboard.down('w');
    const log = [];
    while (shot < 12) {
      const st = await p.evaluate(() => ({ t: window.__sangoku.time(), ...window.__sangoku.player() }));
      while (k < route.length - 1 && Math.hypot(route[k][0] - st.x, route[k][2] - st.z) < 22) k++;
      const [tx, , tz] = route[k];
      await p.evaluate(([dx, dz]) => window.__sangoku.face(dx, dz), [tx - st.x, tz - st.z]);
      const el = st.t - t0;
      if (el >= (shot + 1) * 2500) {
        await p.keyboard.up('w');
        await p.evaluate(() => window.__sangoku.pause(true));
        await wait(1200);
        await p.screenshot({ path: `${OUT}/${tag}-run-${String(shot + 1).padStart(2, '0')}.png` });
        log.push({ shot: shot + 1, t: Math.round(el / 100) / 10, x: Math.round(st.x), y: Math.round(st.y), z: Math.round(st.z), k });
        shot++;
        await p.evaluate(() => window.__sangoku.pause(false));
        await p.keyboard.down('w');
      }
      await wait(40);
    }
    await p.keyboard.up('w');
    console.log(JSON.stringify({ tag, log, errs }));
  }
  await browser.close();
})();
