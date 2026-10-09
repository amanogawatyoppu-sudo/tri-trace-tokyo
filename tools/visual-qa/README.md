# Visual QA (v9.1 review)

Playwright scripts used for the v9.1 before/after review. They drive a real match through the
`?debug` hooks (read-only, plus photo helpers: `pause`, `orbit`, `zoom`, `place`, `sprint`, and
`&deal=nation,role` for a fixed faction/role), so two builds can be shot from the same spots.

```bash
npm i -D playwright            # or use a global install; CHROME=/path/to/chrome to pick a browser
npm run build                  # then serve two builds, e.g. old on :4180, new on :4191
python3 -m http.server 4191 -d dist
mkdir -p ../qa ../perf          # the scripts write next to their folder: ../qa, ../perf
node qa.cjs   before http://localhost:4180/   # characters, line-ups, streets, time of day
node qa.cjs   after  http://localhost:4191/
node chars.cjs before http://localhost:4180/  # 2x character close-ups
node stairs.cjs after http://localhost:4191/  # stair entrances, day / night
node gp.cjs   after  http://localhost:4191/   # TRACE -> LOCK POINT, stairs, meeting (prints JSON)
BASE=http://localhost:4191/ node tour.cjs after 1366 768   # draw calls / triangles / memory per spot
python3 pair.py out.jpg "title" before after enemy-front enemy-back   # side-by-side sheet
python3 expo.py ../qa/after-shibuya-day.png                            # exposure numbers
```

Headless Chromium here renders with SwiftShader (CPU). Its fps says nothing about a real GPU;
compare draw calls, triangles and memory instead, and measure frame time on a device with
`__sangoku.frameStats()` (open the game with `?debug`, play ~10 s, run it in the console).

## v9.2 art prototype
- `block.cjs` — Shibuya showcase spots A–D, day/sunset/night (`Q='&art=v2'`; `CAM91=1` = v9.1 camera for strict pairs)
- `factions.cjs` — SOL/LUNA/STAR side by side in front of the signs (`Q='&art=v2all'`)
- `game2.cjs` — the player in the normal camera: idle/run/sprint/turn/stop, plus on-screen height
- `tour.cjs` — renderer.info at 10 fixed spots (`BASE=… Q=…`)
- `mk92.py` — builds the sheets in `docs/review-v9.2/`

## MAP REFORGE phase 3（秋葉原）
- `aki-spots.cjs` — fixed spots, day/sunset/night (`[name,x,z,fx,fz,y,tilt,zoom,time]`; zoom/tilt reset per spot via `__sangoku.zoom/tilt`)
- `aki-run30.cjs` — 30 s run with real key input, 12 frames evenly in game time
- `aki-perf.cjs` — draw calls / triangles / frame time / memory at 6 spots, day and night
- `aki-dump.qa.ts` — `OUT=x.json npx vitest run --config tools/visual-qa/vitest.qa.ts`: prims + walkability flood fill from LUNA's base
- `aki-plan.py`, `aki-sheets.py` — plan and review sheets (`AKI=<dir>`)

## MAP REFORGE parallel A（上野）
- Spots and the 30 s run reuse `aki-spots.cjs` / `aki-run30.cjs` (route and spots in `docs/review-ueno/README.md`)
- `ueno-perf.cjs` — like `aki-perf.cjs`, at 6 Ueno spots plus one spot in Akihabara, Shibuya and Shinjuku (run with `AUTO0=1 TIER=0` so the quality tier does not step down mid-run)
- `ueno-plan.qa.ts` — `OUT=x.json npx vitest run --config tools/visual-qa/vitest.qa.ts tools/visual-qa/ueno-plan.qa.ts`: prims + walkability flood fill from LUNA's base
- `ueno-basehash.qa.ts` — prints the outside-Ueno hashes (run it on the base commit to refresh `BEFORE` in `tests/uenoReforge.test.ts`)
- `ueno-plan.py before.json after.json out.jpg`, `ueno-sheets.py` (`UENO=<dir>`) — plan and review sheets

## MAP REFORGE parallel F（中央 CONTROL CORE）
- Spots reuse `shg-shots.cjs` (`SPOTS` in `/mnt/project-files/review-chuo/README.md`), tags `before` / `after`
- `chuo-run30.cjs <base> <outdir> <tag> '<route json>'` — like `shg-run30.cjs`; everyone but the player is held still (中央 is nobody's home ground)
- `chuo-perf.cjs <base> <tag>` — draw calls / triangles / frame time / memory at 6 Chuo spots, day and night (run with `AUTO0=1 TIER=0`)
- `chuo-plan.qa.ts` — `OUT=x.json npx vitest run --config tools/visual-qa/vitest.qa.ts chuo-plan`: prims + walkability flood fill from the strategic point
- `chuo-plan.py before.json after.json out.jpg`, `chuo-sheets.py` (`CHUO=<dir>`) — plan and review sheets
