"""BEFORE / AFTER plan of Ikebukuro: walkable reach (ground / stairs / roofs), buildings, routes, landmarks."""
import json, sys
from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1:4]
S = 0.62
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
f_title, f_lab, f_small = ImageFont.truetype(FB, 26), ImageFont.truetype(FB, 15), ImageFont.truetype(FR, 12)


def top(w):
    return w.get('y1', max(w.get('hHigh', 0), w.get('hLow', 0)))


def panel(path, title, after_mode):
    d = json.load(open(path)); R = d['R']
    W = int((R['x1'] - R['x0']) * S); H = int((R['z1'] - R['z0']) * S)
    im = Image.new('RGB', (W, H + 46), (22, 23, 27)); g = ImageDraw.Draw(im)
    P = lambda x, z: ((x - R['x0']) * S, (z - R['z0']) * S + 46)
    g.text((12, 8), title, font=f_title, fill=(235, 236, 240))
    for s in d['streets']:
        g.rectangle([*P(s['x'] - s['w'] / 2, s['z'] - s['d'] / 2), *P(s['x'] + s['w'] / 2, s['z'] + s['d'] / 2)], fill=(44, 45, 52))
    # Buildings and structures (outlines; filled for the rebuilt district).
    for w in sorted(d['world'], key=top):
        if w['mat'] == 'sidewalk':
            continue
        t = top(w); grp = w.get('group')
        box = [*P(w['x'] - w['w'] / 2, w['z'] - w['d'] / 2), *P(w['x'] + w['w'] / 2, w['z'] + w['d'] / 2)]
        if grp == 'ikebukuro':
            if w.get('noFloor') and w.get('y0', 0) > 0 and min(w['w'], w['d']) <= 6.5:
                continue  # fences and rails: drawn later
            if w.get('noFloor') and w.get('y0', 0) > 0:
                g.rectangle(box, fill=(70, 120, 175)); continue  # roof plant (hides people)
            if w['kind'] == 'ramp':
                continue
            if w.get('noFloor'):
                g.rectangle(box, fill=(78, 80, 92), outline=(110, 112, 125)); continue  # backdrop buildings
            continue
        col = (95, 140, 190) if w['mat'] == 'glass' else (120, 112, 98)
        if grp == 'expressway':
            col = (90, 90, 96)
        g.rectangle(box, outline=col, width=2)
    # Walkable reach from the strategic point (20-unit cells): street, stairs, roofs.
    ikb = [w for w in d['world'] if w.get('group') == 'ikebukuro' and not w.get('noFloor')]
    def on_ikb(x, z, y):
        for w in ikb:
            if abs(x - w['x']) > w['w'] / 2 + 1 or abs(z - w['z']) > w['d'] / 2 + 1:
                continue
            if w['kind'] == 'ramp' and min(w['hLow'], w['hHigh']) - 2 <= y <= max(w['hLow'], w['hHigh']) + 2:
                return True
            if w['kind'] == 'box' and abs(w['y1'] - y) < 3:
                return True
        return False
    for x, z, y in sorted(d['walk'], key=lambda c: c[2]):
        if y < 20:
            c = (64, 66, 74)
        elif on_ikb(x, z, y):
            c = (226, 178, 60) if y < 270 else (214, 218, 226)
        else:
            c = (104, 106, 118)  # other raised ground (the expressway ramp)
        g.rectangle([*P(x - 10, z - 10), *P(x + 10, z + 10)], fill=c)
    if after_mode:
        for w in d['world']:
            if w.get('group') == 'ikebukuro' and w.get('noFloor') and w.get('y0', 0) > 0 and min(w['w'], w['d']) <= 6.5:
                g.rectangle([*P(w['x'] - w['w'] / 2, w['z'] - w['d'] / 2), *P(w['x'] + w['w'] / 2, w['z'] + w['d'] / 2)], fill=(200, 60, 70))
            if w.get('group') == 'ikebukuro' and w.get('noFloor') and w.get('y0', 0) > 0 and min(w['w'], w['d']) > 6.5:
                g.rectangle([*P(w['x'] - w['w'] / 2, w['z'] - w['d'] / 2), *P(w['x'] + w['w'] / 2, w['z'] + w['d'] / 2)], fill=(70, 120, 175))
    p = d['point']
    g.ellipse([*P(p['x'] - 150, p['z'] - 150), *P(p['x'] + 150, p['z'] + 150)], outline=(255, 90, 90), width=3)
    g.text(P(p['x'] - 70, p['z'] - 8), 'STRATEGIC POINT', font=f_small, fill=(255, 140, 140))
    for l in d['lights']:
        g.ellipse([*P(l['x'] - 7, l['z'] - 7), *P(l['x'] + 7, l['z'] + 7)], fill=(255, 226, 120))
    for x in range(-2600, -1100, 200):
        g.text(P(x + 3, R['z0'] + 4), str(x), font=f_small, fill=(150, 150, 160))
    for z in range(-5400, -3900, 200):
        g.text(P(R['x0'] + 4, z), str(z), font=f_small, fill=(150, 150, 160))
    if after_mode:
        # Routes: A STREET LOOP (red ring), B ROOFTOP NETWORK (cyan, two crossings), C BACKSTAIR CUT (amber stairs).
        L = [(-2525, -4647), (-1879, -4647), (-1879, -4000), (-2525, -4000), (-2525, -4647)]
        g.line([P(*q) for q in L], fill=(255, 70, 80), width=4)
        g.text(P(-2690, -3992), 'A  STREET LOOP', font=f_lab, fill=(255, 110, 120))
        for path in ([(-2330, -4180), (-2330, -4530), (-2039, -4532), (-2039, -4180)], [(-2330, -4255), (-2039, -4255)], [(-2042, -4560), (-2042, -5060)]):
            g.line([P(*q) for q in path], fill=(40, 210, 255), width=3)
        g.text(P(-2690, -3965), 'B  ROOFTOP NETWORK', font=f_lab, fill=(80, 220, 255))
        g.text(P(-2690, -3938), 'C  BACKSTAIR CUT (amber stairs)', font=f_lab, fill=(240, 190, 70))
        labels = [
            ('SKY SERVICE', -2000, -5180), ('SKY LINK', -2030, -4880), ('NETWORK HUB', -2230, -4235), ('SIGNAL GARDEN', -2400, -4100),
            ('ROOFTOP LOOP', -2290, -4610), ('fire escape', -2120, -5420), ('fire escape', -1890, -4580), ('outdoor stair', -2560, -4600),
            ('lane fire escape', -2200, -4400), ('Sunshine 60 (skyline)', -1800, -5560),
        ]
        for t, x, z in labels:
            g.text(P(x, z), t, font=f_lab, fill=(250, 250, 255), stroke_width=2, stroke_fill=(10, 10, 14))
    return im


a = panel(before, 'BEFORE  (map-reforge-base bbe30ec)', False)
b = panel(after, 'AFTER  IKEBUKURO ROOFTOP NETWORK', True)
leg = Image.new('RGB', (a.width + b.width + 10, 64), (22, 23, 27)); lg = ImageDraw.Draw(leg)
items = [((64, 66, 74), 'street (walkable)'), ((226, 178, 60), 'stairs / landings'), ((214, 218, 226), 'roofs & bridges (3F)'), ((70, 120, 175), 'roof plant (blocks sight)'),
         ((200, 60, 70), 'fence (chain-link)'), ((78, 80, 92), 'backdrop buildings'), ((104, 106, 118), 'expressway ramp'), ((255, 226, 120), 'lamps')]
x = 14
for c, t in items:
    lg.rectangle([x, 22, x + 22, 42], fill=c); lg.text((x + 28, 22), t, font=f_lab, fill=(220, 222, 228)); x += 40 + int(lg.textlength(t, font=f_lab))
lg.text((14, 2), 'Shaded = everywhere you can walk to from the strategic point (20-unit cells, stairs and roofs included).', font=f_small, fill=(170, 172, 180))
im = Image.new('RGB', (a.width + b.width + 10, a.height + 64), (12, 12, 14))
im.paste(a, (0, 0)); im.paste(b, (a.width + 10, 0)); im.paste(leg, (0, a.height))
im.save(out, quality=90)
