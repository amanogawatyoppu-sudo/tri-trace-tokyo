// 品川 FUTURE GATEWAY: fixed spots, day / sunset / night, plus renderer.info per spot.
// SPOTS='[["name",x,z,fx,fz,{y,zoom,tilt,orbit}],...]' node shg-shots.cjs <tag> <base> <outdir> [times]
const fs = require('fs');
const { start, wait } = require('./start9.cjs');
const [tag, base, out, timesArg] = process.argv.slice(2);
const times = (timesArg ?? 'day').split(',');
const T = { day: 9000, sunset: 150000, night: 291000 };
const SPOTS = JSON.parse(process.env.SPOTS);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const W = Number(process.env.W ?? 1366), H = Number(process.env.H ?? 768);
  const { browser, p, errs } = await start({ base, deal: 'star,ranger', W, H, seed: 7 });
  const S = (f, a) => p.evaluate(f, a);
  const info = {};
  for (const [name, x, z, fx, fz, o = {}] of SPOTS) for (const t of times) {
    await S(([x, z, fx, fz, ms, o]) => {
      const g = window.__sangoku;
      g.pause(false); g.setTime(ms); g.teleport(x, z, o.y); g.face(fx, fz);
      g.zoom(o.zoom ?? 0); g.orbit(o.orbit ?? 0); if (o.tilt !== undefined) g.tilt(o.tilt);
    }, [x, z, fx, fz, T[t], o]);
    await wait(2200);
    await S(() => window.__sangoku.pause(true));
    await wait(900);
    await p.screenshot({ path: `${out}/${tag}-${name}-${t}.png` });
    info[`${name}-${t}`] = await S(() => window.__sangoku.renderInfo());
  }
  fs.writeFileSync(`${out}/${tag}-info.json`, JSON.stringify({ errs, info }, null, 1));
  console.log(JSON.stringify({ tag, errs: errs.length }));
  await browser.close();
})();
