// Akihabara review spots: node aki-spots.cjs <base> <outdir> '<json [name,x,z,fx,fz,y,tilt,zoom,time]...>'
const { start, wait } = require('./start9.cjs');
(async () => {
  const { browser, p } = await start({ base: process.argv[2], deal: 'moon,ranger' });
  const S = (f, a) => p.evaluate(f, a);
  const T = { day: 9000, sunset: 150000, night: 291000 };
  for (const [n, x, z, fx, fz, y, tilt, zoom, tm] of JSON.parse(process.argv[4])) {
    await S(([x, z, fx, fz, y, ms]) => { const g = window.__sangoku; g.pause(false); g.setTime(ms); g.teleport(x, z, y || undefined); g.face(fx, fz); }, [x, z, fx, fz, y, T[tm || 'day']]);
    // Normal camera, reset every spot: default distance 160 / pitch 0.42; zoom steps of 15 out, tilt = flattest pitch (both within the player's range).
    await S(([d, pt]) => { const g = window.__sangoku; g.zoom(d); g.tilt(pt); }, [160 + 15 * (zoom || 0), tilt ? 0.16 : 0.42]);
    await wait(2000); await S(() => window.__sangoku.pause(true)); await wait(500);
    console.log(n, JSON.stringify(await S(() => [window.__sangoku.player(), window.__sangoku.cameraPos()])));
    await p.screenshot({ path: `${process.argv[3]}/${n}.png` });
  }
  await browser.close();
})();
