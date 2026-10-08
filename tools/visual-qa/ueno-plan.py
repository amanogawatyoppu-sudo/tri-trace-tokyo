# Ueno plan, BEFORE / AFTER, from two ueno-plan.qa.ts dumps: python3 ueno-plan.py before.json after.json out.jpg
import json, sys
from PIL import Image, ImageDraw, ImageFont
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
X0,X1,Z0,Z1=1820,3340,-4640,-3000
S=0.6
PW,PH=int((X1-X0)*S),int((Z1-Z0)*S)
TOP,BOT,GAP=46,130,16
img=Image.new('RGB',(PW*2+GAP,PH+TOP+BOT),(22,23,28)); D=ImageDraw.Draw(img)
ROUTES={
  'A':[(2700,-3340),(2450,-3650),(2250,-3680),(2250,-3830),(2410,-3830),(2410,-4250),(2600,-4180),(2750,-4089)],
  'B':[(2450,-3650),(2250,-3646),(2080,-3646),(2040,-3760),(2075,-3870),(1960,-3880),(1990,-3990),(2095,-4065),(2250,-4065)],
  'C':[(2800,-3340),(2800,-3385),(2800,-3725),(2800,-3790),(2750,-4089)],
}
def panel(path, ox, after):
  d=json.load(open(path))
  pim=Image.new('RGB',(PW,PH),(14,14,18)); dr=ImageDraw.Draw(pim)
  P=lambda x,z:((x-X0)*S,(z-Z0)*S)
  def R(x0,z0,x1,z1,**k): dr.rectangle([*P(x0,z0),*P(x1,z1)],**k)
  for x,z,y in d['open']:
    R(x-10,z-10,x+10,z+10,fill=(58,60,70) if y<10 else (52,92,64) if y<100 else (86,134,92))
  for s in d['segs']:
    R(s['x']-s['w']/2+2,s['z']-s['d']/2,s['x']+s['w']/2-2,s['z']+s['d']/2,outline=(90,92,104))
  trees=[]
  for p in sorted(d['prims'],key=lambda p:p.get('y1',0)):
    x0,x1,z0,z1=p['x']-p['w']/2,p['x']+p['w']/2,p['z']-p['d']/2,p['z']+p['d']/2
    m,g=p['mat'],p.get('group','')
    if m=='water': R(x0,z0,x1,z1,fill=(30,60,110)); continue
    if m=='sidewalk': continue
    if p['kind']=='ramp': R(x0,z0,x1,z1,fill=(230,140,50)); continue
    if g=='uenoTree' or m=='tree': trees.append(p); continue
    if g=='uenoHedge': R(x0,z0,x1,z1,fill=(40,120,50)); continue
    if g in ('uenoWall','uenoRail'): R(x0,z0,x1,z1,fill=(170,166,156)); continue
    if g=='uenoTrellis':
      if p['y0']>=50: R(x0,z0,x1,z1,outline=(160,110,70),width=2)
      else: R(x0,z0,x1,z1,fill=(160,110,70))
      continue
    if g=='uenoGate':
      if p['y0']>=50: continue
      R(x0,z0,x1,z1,fill=(230,220,190)); continue
    if g in ('uenoHall','museum'): R(x0,z0,x1,z1,fill=(196,186,160)); continue
    if m=='pole': R(x0-3,z0-3,x1+3,z1+3,fill=(160,160,170)); continue
    if p.get('y1',0)<=6: continue
    if g in ('hill','uenoTerrace','uenoAxis') or m in ('earth','stone'):
      if p.get('y1',0)>=100 and p['w']*p['d']>40000: continue  # the plateau itself: shown by its walkable top
      R(x0,z0,x1,z1,outline=(150,150,140),width=2); continue
    R(x0,z0,x1,z1,fill=(150,146,132))
  for t in trees:
    x,z=P(t['x'],t['z']); r=max(6,t['w']*S*0.9)
    dr.ellipse([x-r,z-r,x+r,z+r],fill=(30,170,60),outline=(10,60,20))
  for l in d.get('lights',[]): pass
  b,j,pt=d['base'],d['jail'],d['point']
  r=150*S; px,pz=P(pt['x'],pt['z']); dr.ellipse([px-r,pz-r,px+r,pz+r],outline=(255,255,255),width=3)
  R(b['x']-250,b['z']-250,b['x']+250,b['z']+250,outline=(87,168,255),width=3)
  f=F(15)
  bx,bz=P(b['x'],b['z']-230); dr.text((bx-36,bz),'LUNA 拠点',fill=(150,200,255),font=f)
  dr.text((px-40,pz-8),'戦略拠点',fill=(255,255,255),font=f)
  dr.text(P(2060,-3460),'不忍池',fill=(150,190,255),font=f)
  if after:
    cols={'A':(255,210,90),'B':(70,255,140),'C':(255,110,90)}
    labels={'A':('A GRAND PROMENADE',2160,-4250),'B':('B GROVE PATH',1830,-4600),'C':('C TERRACE ROUTE',2880,-3660)}
    for k,pts in ROUTES.items():
      dr.line([P(x,z) for x,z in pts],fill=cols[k],width=5,joint='curve')
      t,lx,lz=labels[k]; dr.text(P(lx,lz),t,fill=cols[k],font=F(17))
    for t,x,z in [('STONE AXIS',2880,-3480),('GREEN TERRACE',2610,-3790),('CANOPY WALK',2560,-4600),('CULTURE GATE',2700,-3320),('UENO HALL',2575,-4330),('WEST RAMP',2480,-3980),('B→A 合流（生垣の切れ目3か所）',2160,-4110),('藤棚',1950,-3965)]:
      dr.text(P(x,z),t,fill=(255,240,200),font=F(14))
  else:
    dr.text(P(2420,-3840),'旧 西の坂・南の石段',fill=(255,240,200),font=F(14))
  img.paste(pim,(ox,TOP))
  D.text((ox+8,8),('AFTER（上野 GREEN HEIGHTS）' if after else 'BEFORE（map-reforge-base bbe30ec）'),fill=(240,240,240),font=F(22))
panel(sys.argv[1],0,False); panel(sys.argv[2],PW+GAP,True)
legend=['灰: 拠点から歩いて行ける地面（実測の塗りつぶし）  明るい緑: 台地の上（高さ130）  暗い緑: 石段の途中・踊り場  橙: 坂・石段',
        '緑の丸: 木の幹（隠れられる太さ）  濃い緑: 生垣  明るい灰: 低い石壁・欄干  ベージュ: 門・ホール  白い円: 戦略拠点の半径150',
        'A 大通り（速いが台地から丸見え）  B 木立の道（幹と生垣で視線が切れる）  C 石段から高台（遅いが広場と大通りを見下ろせる）']
for i,t in enumerate(legend): D.text((10,TOP+PH+12+i*26),t,fill=(220,220,220),font=F(17))
img.save(sys.argv[3],quality=88)
print(img.size)
