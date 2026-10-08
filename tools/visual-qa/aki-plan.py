import os
AKI=os.environ.get('AKI','/tmp/claude-0/aki/')
import json
from PIL import Image, ImageDraw, ImageFont
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
X0,X1,Z0,Z1=1600,3000,-3200,-2150
S=0.62
PW,PH=int((X1-X0)*S),int((Z1-Z0)*S)
TOP,BOT,GAP=46,150,16
img=Image.new('RGB',(PW*2+GAP,PH+TOP+BOT),(22,23,28)); D=ImageDraw.Draw(img)
def panel(name, ox, after):
  d=json.load(open(AKI+'%s.json'%name))
  pim=Image.new('RGB',(PW,PH),(14,14,18)); dr=ImageDraw.Draw(pim)
  P=lambda x,z:((x-X0)*S,(z-Z0)*S)
  def R(x0,z0,x1,z1,**k): dr.rectangle([*P(x0,z0),*P(x1,z1)],**k)
  # walkable ground reachable from the base (flood fill), deck cells lighter
  for x,z,y in d['open']:
    c=(58,60,70) if y<10 else (70,150,170)
    R(x-10,z-10,x+10,z+10,fill=c)
  for s in d['segs']:
    R(s['x']-s['w']/2+2,s['z']-s['d']/2,s['x']+s['w']/2-2,s['z']+s['d']/2,outline=(90,92,104))
  for p in sorted(d['prims'],key=lambda p:p.get('y1',0)):
    x0,x1,z0,z1=p['x']-p['w']/2,p['x']+p['w']/2,p['z']-p['d']/2,p['z']+p['d']/2
    m,g=p['mat'],p.get('group','')
    if m=='water': R(x0,z0,x1,z1,fill=(30,60,110)); continue
    if m=='sidewalk': continue
    if p['kind']=='ramp': R(x0,z0,x1,z1,fill=(230,140,50)); continue
    if m=='pole': R(x0-3,z0-3,x1+3,z1+3,fill=(160,160,170)); continue
    if m=='vending': R(x0,z0,x1,z1,fill=(220,60,80)); continue
    if g=='akibaGate':
      if p['y0']>=50: continue
      R(x0,z0,x1,z1,fill=(90,200,230)); continue
    if g in ('akibaTower','akibaPower','akibaBoard'): R(x0,z0,x1,z1,fill=(170,110,255)); continue
    if g=='bridge': R(x0,z0,x1,z1,fill=(120,120,130)); continue
    if p.get('y1',0)<=6: continue
    if p['y0']>=50: R(x0,z0,x1,z1,outline=(200,196,180),width=2); continue  # upper storeys over a passage
    R(x0,z0,x1,z1,fill=(150,146,132) if m!='brick' else (150,90,70))
  # sites
  b,j,pt=d['base'],d['jail'],d['point']
  r=150*S; bx,bz=P(b['x'],b['z']); dr.ellipse([bx-r,bz-r,bx+r,bz+r],outline=(87,168,255),width=3)
  R(j['x']-120,j['z']-30,j['x']+120,j['z']+30,outline=(87,168,255),width=3)
  px,pz=P(pt['x'],pt['z']); dr.ellipse([px-r,pz-r,px+r,pz+r],outline=(255,255,255),width=3)
  f=F(15)
  dr.text((bx-30,bz-8),'LUNA 拠点',fill=(150,200,255),font=f)
  dr.text(P(j['x']-50,j['z']-12),'LOCK POINT',fill=(150,200,255),font=f)
  dr.text((px-40,pz-8),'戦略拠点',fill=(255,255,255),font=f)
  if after:
    def route(pts,col,label,lx,lz):
      dr.line([P(x,z) for x,z in pts],fill=col,width=5,joint='curve')
      dr.text(P(lx,lz),label,fill=col,font=F(17))
    route([(2700,-2950),(2420,-2920),(2380,-2840),(2222,-2800),(2222,-2520),(2416,-2470),(2642,-2300)],(120,110,255),'A 大通り',2232,-2660)
    R(2084,-2800,2418,-2752,outline=(90,220,255),width=3)
    route([(2700,-2960),(2360,-2937),(1911,-2937),(1911,-2640),(1780,-2640),(1754,-2420),(2024,-2420),(2024,-2484),(2112,-2484)],(70,255,140),'B 部品路地（西）',1712,-2750)
    route([(2112,-2580),(1913,-2580)],(70,255,140),'',0,0)
    route([(2780,-2860),(2620,-2700),(2620,-2440),(2642,-2300)],(70,255,140),'B（東）',2585,-2620)
    for t,x,z in [('P1 搬入口',1975,-2600),('R2 搬入口',2700,-2735)]: dr.text(P(x,z),t,fill=(255,255,255),font=F(13))
    route([(2780,-2900),(2840,-2810),(2840,-2610),(2815,-2440),(2642,-2300)],(255,70,100),'C 裏通路',2850,-2560)
    for t,x,z in [('GRID TOWER',2440,-2985),('CIRCUIT ARCADE',1700,-2990),('GRID GATE（高さ80）',2150,-2830),('DATA JUNCTION',2440,-2245),('POWER NODE',2790,-2830)]:
      dr.text(P(x,z),t,fill=(255,230,120),font=F(15))
  img.paste(pim,(ox,TOP))
  D.text((ox+8,8),('AFTER（MAP REFORGE phase 3：秋葉原 ELECTRIC GRID）' if after else 'BEFORE（v10.0）'),fill=(240,240,240),font=F(22))
panel('before',0,False); panel('after',PW+GAP,True)
legend=['灰: 拠点から歩いて行ける地面（実測の塗りつぶし）  水色: GRID GATE の上  橙: 階段  白枠: 1階が通り抜けの建物（搬入口）',
        '茶: 建物  レンガ: CIRCUIT ARCADE  紫: GRID TOWER・POWER NODE・LED ボード  赤点: 自販機  円: 半径150（拠点・戦略拠点）',
        'A 大通り（速いが見られる） B 部品路地（視線が切れる） C 裏通路（短いが入口が見つけにくい）']
for i,t in enumerate(legend): D.text((10,TOP+PH+12+i*26),t,fill=(220,220,220),font=F(17))
img.save(AKI+'plan.jpg',quality=88)
print(img.size)
