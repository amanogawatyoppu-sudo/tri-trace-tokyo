# BEFORE / AFTER plan of 東京タワー from two ttw-plan.qa.ts dumps (walkable ground is the measured flood fill from the point).
# python3 ttw-plan.py before.json after.json out.png
import json, sys
from PIL import Image, ImageDraw, ImageFont
FONT = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F, FB, FT = ImageFont.truetype(FONT, 13), ImageFont.truetype(FONT, 15), ImageFont.truetype(FONT, 22)
A = dict(x0=-300, x1=1500, z0=1800, z1=3560)
S = 0.42
W, H = int((A['x1'] - A['x0']) * S), int((A['z1'] - A['z0']) * S)
P = lambda x, z: ((x - A['x0']) * S, (z - A['z0']) * S)
ROUTES = {
  'A RED AXIS': ((235, 60, 60), [(487, 3540), (487, 2960), (487, 2420), (487, 1880)]),
  'B TERRACE RING': ((60, 210, 240), [(105, 2960), (105, 2700), (105, 2040), (310, 2040), (487, 2040), (665, 2040), (870, 2040), (870, 2700), (870, 2960)]),
  'C SERVICE SLOPE': ((90, 220, 120), [(1000, 3010), (1000, 2420), (995, 2050), (995, 2020)]),
}
LABELS = [('RED TOWER', 487, 2375), ('RED TERRACE', 487, 1955), ('TOWER GATE', 487, 3010), ('SERVICE WALL', 1250, 2250), ('SKY PLAZA', 300, 2860)]


def draw(d, title, after):
  im = Image.new('RGB', (W, H + 40), (14, 14, 18))
  dr = ImageDraw.Draw(im)
  R = lambda x0, z0, x1, z1, **k: dr.rectangle([P(x0, z0)[0], P(x0, z0)[1] + 40, P(x1, z1)[0], P(x1, z1)[1] + 40], **k)
  for s in d['segs']: R(s['x'] - s['w'] / 2, s['z'] - s['d'] / 2, s['x'] + s['w'] / 2, s['z'] + s['d'] / 2, fill=(30, 31, 38))
  ground = [(x, z) for x, z, y in d['open'] if y < 10]
  for x, z in ground: R(x - 10, z - 10, x + 10, z + 10, fill=(64, 66, 76))
  for p in sorted(d['prims'], key=lambda p: 500 if p['kind'] == 'ramp' else (900 if (p.get('group') or '') == 'ttwRail' else p.get('y1', 0))):
    if p['mat'] == 'sidewalk': continue
    x0, x1, z0, z1 = p['x'] - p['w'] / 2, p['x'] + p['w'] / 2, p['z'] - p['d'] / 2, p['z'] + p['d'] / 2
    if p['kind'] == 'ramp': R(x0, z0, x1, z1, fill=(150, 104, 52)); continue
    if p['mat'] == 'tree': R(x0 - 6, z0 - 6, x1 + 6, z1 + 6, fill=(54, 108, 66)); continue
    if (p.get('group') or '') == 'ttwRail': R(x0, z0, x1, z1, fill=(150, 150, 160)); continue
    if p['y0'] >= 50: R(x0, z0, x1, z1, outline=(170, 166, 150)); continue
    R(x0, z0, x1, z1, fill=(118, 114, 104) if p['mat'] not in ('steel',) else (150, 34, 40))
  for x, z, y in d['open']:
    if y < 10: continue
    c = (232, 186, 70) if y < 160 else (255, 90, 90)
    R(x - 3, z - 3, x + 3, z + 3, fill=c)
  pt = d['point']; r = 170 * S; px, pz = P(pt['x'], pt['z'])
  dr.ellipse([px - r, pz + 40 - r, px + r, pz + 40 + r], outline=(255, 255, 255), width=2)
  dr.text((px + r + 4, pz + 40 - 8), '拠点', fill=(255, 255, 255), font=F)
  if after:
    for name, (c, pts) in ROUTES.items():
      dr.line([(P(x, z)[0], P(x, z)[1] + 40) for x, z in pts], fill=c, width=4)
      x, z = pts[0]; dr.text((P(x, z)[0] + 6, P(x, z)[1] + 40 - 18), name, fill=c, font=FB)
    for t, x, z in LABELS:
      bx, bz = P(x, z); w = dr.textlength(t, font=F)
      dr.rectangle([bx - w / 2 - 3, bz + 40 - 9, bx + w / 2 + 3, bz + 40 + 9], fill=(0, 0, 0))
      dr.text((bx - w / 2, bz + 40 - 8), t, fill=(240, 236, 226), font=F)
  dr.text((10, 8), title, fill=(255, 255, 255), font=FT)
  return im


b, a = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
L = draw(b, 'BEFORE（897dc77）', False)
Rr = draw(a, 'AFTER（RED HEIGHT）', True)
out = Image.new('RGB', (W * 2 + 20, H + 40 + 70), (14, 14, 18))
out.paste(L, (0, 0)); out.paste(Rr, (W + 20, 0))
dr = ImageDraw.Draw(out)
lg = [((64, 66, 76), '歩ける地面（拠点から実測で塗りつぶし）'), ((232, 186, 70), 'テラス上（高さ120）'), ((255, 90, 90), 'RED TERRACE（高さ210）'),
      ((150, 104, 52), '階段・スロープ'), ((150, 150, 160), '手すり'), ((118, 114, 104), '壁・建物'), ((150, 34, 40), '塔の脚・鉄骨')]
x = 10
for c, t in lg:
  dr.rectangle([x, H + 58, x + 14, H + 72], fill=c); dr.text((x + 20, H + 57), t, fill=(220, 220, 220), font=F)
  x += 30 + dr.textlength(t, font=F)
dr.text((10, H + 84), '北が上。白い円は戦略拠点「東京タワー下」の制圧範囲。', fill=(170, 170, 170), font=F)
out.save(sys.argv[3]); print(out.size)
