# BEFORE / AFTER plan of Bunkyo from bk-plan.qa.ts dumps (side by side).
# python3 bk-plan.py before.json after.json out.png
import sys, json
from PIL import Image, ImageDraw, ImageFont
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
def panel(path, title):
  d=json.load(open(path)); A=d['A']; S=0.42
  PW,PH=int((A['x1']-A['x0'])*S),int((A['z1']-A['z0'])*S)
  im=Image.new('RGB',(PW,PH+44),(20,21,26)); dr=ImageDraw.Draw(im)
  P=lambda x,z:((x-A['x0'])*S,(z-A['z0'])*S+44)
  def R(x0,z0,x1,z1,**k): dr.rectangle([*P(x0,z0),*P(x1,z1)],**k)
  for x,z,y in d['open']:
    t=min(1,y/104)
    c=(int(60+(150-60)*t),int(62+(132-62)*t),int(70+(84-70)*t))
    R(x-10,z-10,x+10,z+10,fill=c)
  for s in d['segs']:
    R(s['x']-s['w']/2,s['z']-s['d']/2,s['x']+s['w']/2,s['z']+s['d']/2,outline=(96,98,110))
  for p in sorted(d['prims'],key=lambda p:p.get('y1',p.get('hHigh',0))):
    x0,x1,z0,z1=p['x']-p['w']/2,p['x']+p['w']/2,p['z']-p['d']/2,p['z']+p['d']/2
    m,g=p['mat'],p.get('group','') or ''
    if m=='sidewalk' or m=='water' and g=='river': 
      if m=='water': R(x0,z0,x1,z1,fill=(40,80,120))
      continue
    if p['kind']=='ramp':
      R(x0,z0,x1,z1,fill=(214,150,70) if p['style']=='slope' else (230,190,90))
      # arrow up-slope
      cx,cz=p['x'],p['z']; L=(p['w'] if p['axis']=='x' else p['d'])*0.35
      dx,dz=(p['dir']*L,0) if p['axis']=='x' else (0,p['dir']*L)
      dr.line([*P(cx-dx,cz-dz),*P(cx+dx,cz+dz)],fill=(60,40,20),width=2)
      ax,az=P(cx+dx,cz+dz); dr.ellipse([ax-3,az-3,ax+3,az+3],fill=(60,40,20))
      continue
    if m=='pole': R(x0-3,z0-3,x1+3,z1+3,fill=(170,170,180)); continue
    if m=='tree': R(x0-4,z0-4,x1+4,z1+4,fill=(70,150,80)); continue
    if m=='vending' or m=='car': R(x0,z0,x1,z1,fill=(200,80,90)); continue
    if g=='bunkyoFence' or p.get('seeThrough'): R(x0,z0,x1,z1,fill=(120,190,230)); continue
    if m=='hedge': R(x0,z0,x1,z1,fill=(46,110,52)); continue
    if g=='bunkyoWall': R(x0,z0,x1,z1,fill=(230,226,214)); continue
    if m=='bldg': R(x0,z0,x1,z1,fill=(92,96,112) if p['y0']<50 else (120,116,104),outline=(30,30,36)); continue
    if m=='earth' or g=='bunkyoGround': R(x0,z0,x1,z1,outline=(170,140,90),width=2); continue
    if m=='water': R(x0,z0,x1,z1,fill=(40,80,120)); continue
    R(x0,z0,x1,z1,fill=(150,150,160))
  for l in d.get('lights',[]):
    x,z=P(l['x'],l['z']); dr.ellipse([x-5,z-5,x+5,z+5],fill=(255,210,120),outline=(90,60,20))
  dr.text((8,8),title,font=F(24),fill=(240,236,226))
  return im
a=panel(sys.argv[1],'BEFORE'); b=panel(sys.argv[2],'AFTER')
W=a.width+b.width+20; Hh=max(a.height,b.height)+80
img=Image.new('RGB',(W,Hh),(20,21,26)); img.paste(a,(0,0)); img.paste(b,(a.width+20,0))
D=ImageDraw.Draw(img)
D.text((10,Hh-68),'文京 QUIET SLOPES  平面図  灰〜黄土=歩ける範囲（明るいほど高い, 台地 y104）',font=F(18),fill=(220,216,206))
D.text((10,Hh-40),'橙=坂（点が上り側） 黄=階段  水色=ガード柵（視線は通る） 白=塀 緑=生垣 黄丸=街灯',font=F(18),fill=(220,216,206))
img.save(sys.argv[3])
