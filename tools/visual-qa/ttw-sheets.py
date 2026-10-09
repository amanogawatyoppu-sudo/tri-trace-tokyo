# Review sheets for 東京タワー RED HEIGHT from ttw-shots.cjs / shg-run30.cjs captures.
# TTW=<dir with rev/ (before-*, after-*) and run/ (run-NN.png, log.json)> OUT=<dir> python3 ttw-sheets.py
from PIL import Image, ImageDraw, ImageFont
import json, os
FONT = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F = lambda s: ImageFont.truetype(FONT, s)
A = os.environ.get('TTW', '/home/claude/ttw/')
OUT = os.environ.get('OUT', A + 'out/'); os.makedirs(OUT, exist_ok=True)


def tile(path, w=620):
  im = Image.open(path).crop((180, 69, 1170, 768)); h = int(im.height * w / im.width); return im.resize((w, h))


def sheet(out, title, rows, w=620):
  ncol = max(len(r[1]) for r in rows); th = int(699 * w / 990)
  W = Image.new('RGB', (150 + ncol * (w + 8), 60 + len(rows) * (th + 34)), (20, 21, 26)); d = ImageDraw.Draw(W)
  d.text((12, 14), title, fill=(240, 240, 240), font=F(24))
  for i, (lab, cells) in enumerate(rows):
    y = 60 + i * (th + 34)
    d.text((12, y + th // 2 - 10), lab, fill=(255, 230, 120), font=F(20))
    for j, (cap, p) in enumerate(cells):
      x = 150 + j * (w + 8)
      if p: W.paste(tile(p, w), (x, y + 26))
      d.text((x, y + 2), cap, fill=(220, 220, 220), font=F(17))
  W.save(OUT + out, quality=86); print(out, W.size)


f = lambda n, t: A + 'rev/after-%s-%s.png' % (n, t)
b = lambda n, t: A + 'rev/before-%s-%s.png' % (n, t)
T = [('昼', 'day'), ('夕方', 'sunset'), ('夜', 'night')]


def three(out, title, key):
  sheet(out, title, [('BEFORE', [(c, b(key, t)) for c, t in T]), ('AFTER', [(c, f(key, t)) for c, t in T])])


three('1-red-axis.jpg', 'A. RED AXIS（南の大通りから北へ。TOWER GATE の先に塔、一直線）', 'axis')
three('2-terrace-ring.jpg', 'B. TERRACE RING（西のテラス、高さ120の上から広場と塔の脚を見下ろす）', 'ring')
three('3-service-slope.jpg', 'C. SERVICE SLOPE（裏の通路から北へ。左が擁壁、右が SERVICE WALL、奥がスロープ）', 'slope')
three('4-red-tower.jpg', 'RED TOWER（南の上空から。BEFORE と同じ塔の形、色だけ深い赤と投光に変更）', 'tower')
three('5-red-terrace.jpg', 'RED TERRACE（高さ210、軸の真上から南へ。脚の間を RED AXIS が抜ける）', 'redterrace')
three('6-sky-plaza.jpg', 'SKY PLAZA（塔の足元の広場と戦略拠点。右手前は東の内階段）', 'plaza')
L = [('RED AXIS', 'axis'), ('TERRACE RING', 'ring'), ('SERVICE SLOPE', 'slope'), ('RED TOWER', 'tower'), ('RED TERRACE', 'redterrace'), ('SKY PLAZA', 'plaza')]
sheet('7-before-after.jpg', 'BEFORE / AFTER（同じ地点・同じ向き・昼）',
      [('BEFORE', [(n, b(k, 'day')) for n, k in L]), ('AFTER', [(n, f(k, 'day')) for n, k in L])], w=420)
log = json.load(open(A + 'run/log.json'))['log']
names = json.loads(os.environ['NAMES'])
cells = [('%d. %.1f秒 %s' % (i + 1, l['t'], names[i]), A + 'run/run-%02d.png' % i) for i, l in enumerate(log)]
sheet('8-run-30s.jpg', '通常カメラの30秒走行（夕方、12枚、実際のキー操作・ゲーム内時間で等間隔、ダッシュあり）', [('', cells[0:4]), ('', cells[4:8]), ('', cells[8:12])], w=470)
