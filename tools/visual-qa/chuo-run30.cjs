// 中央 CONTROL CORE: 30 s run as a STAR runner in the normal camera: real movement (arrow keys, Shift to dash), 12 frames evenly in game time.
// 中央 is nobody's home ground, so everyone else is held still (stun) for the run: the frames show the route, not a capture.
// node chuo-run30.cjs <base> <outdir> <tag> '[[x,z],[x,z,dash],...]'
const { start, wait } = require('./start9.cjs');
const base = process.argv[2], out = process.argv[3], tag = process.argv[4] ?? 'run';
const R = JSON.parse(process.argv[5]);
const TM = Number(process.env.TM ?? 150000);
(async () => {
  const { browser, p, errs } = await start({ base, deal: process.env.DEAL ?? 'star,ranger' });
  const S = (f, a) => p.evaluate(f, a);
  await S(([x, z, fx, fz, t]) => { const g = window.__sangoku; g.setTime(t); g.teleport(x, z); g.face(fx, fz); }, [R[0][0], R[0][1], R[1][0] - R[0][0], R[1][1] - R[0][1], TM]);
  await S(() => { const g = window.__sangoku; for (const e of g.people()) if (!e.player) g.stun(1e9, e.id); });
  await wait(1500);
  // Which way does ArrowLeft turn?
  const a0 = await S(() => { const q = window.__sangoku.player(); return Math.atan2(q.dirX, q.dirZ); });
  await p.keyboard.down('ArrowLeft'); await wait(400); await p.keyboard.up('ArrowLeft');
  const a1 = await S(() => { const q = window.__sangoku.player(); return Math.atan2(q.dirX, q.dirZ); });
  const leftSign = Math.sign(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))) || 1;
  await S(([fx, fz]) => window.__sangoku.face(fx, fz), [R[1][0] - R[0][0], R[1][1] - R[0][1]]);
  await S(([t]) => window.__sangoku.setTime(t), [TM]);
  const t0 = await S(() => window.__sangoku.time());
  let wp = 1, shots = 0, held = null, dash = false;
  const log = [];
  await p.keyboard.down('ArrowUp');
  for (let it = 0; it < 4000 && wp < R.length; it++) {
    const s = await S(() => ({ q: window.__sangoku.player(), t: window.__sangoku.time() }));
    const el = (s.t - t0) / 1000;
    if (el >= shots * (30 / 11) - 0.05 && shots < 12) {
      await S(() => window.__sangoku.pause(true));
      await p.screenshot({ path: `${out}/${tag}-${String(shots).padStart(2, '0')}.png` });
      log.push({ shot: shots, t: +el.toFixed(2), x: Math.round(s.q.x), y: Math.round(s.q.y), z: Math.round(s.q.z), wp });
      await S(() => window.__sangoku.pause(false));
      shots++;
    }
    const [tx, tz, d] = R[wp];
    const dx = tx - s.q.x, dz = tz - s.q.z, dist = Math.hypot(dx, dz);
    if (dist < 26) { wp++; continue; }
    const want = Math.atan2(dx, dz), cur = Math.atan2(s.q.dirX, s.q.dirZ);
    const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    const key = Math.abs(diff) < 0.1 ? null : (Math.sign(diff) === leftSign ? 'ArrowLeft' : 'ArrowRight');
    if (Math.abs(diff) > 0.45) await S(([fx, fz]) => window.__sangoku.face(fx, fz), [dx, dz]); // sharp corners: turn on the spot
    if (key !== held) { if (held) await p.keyboard.up(held); if (key) await p.keyboard.down(key); held = key; }
    const wantDash = !!d;
    if (wantDash !== dash) { if (wantDash) await p.keyboard.down('Shift'); else await p.keyboard.up('Shift'); dash = wantDash; }
    if (shots >= 12) break;
  }
  const tEnd = await S(() => window.__sangoku.time());
  console.log(JSON.stringify({ leftSign, seconds: (tEnd - t0) / 1000, reached: wp, of: R.length, log, errs }));
  await browser.close();
})();
