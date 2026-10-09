# BEFORE / AFTER plan of Chuo from chuo-plan.qa.ts dumps (side by side).
# python3 chuo-plan.py before.json after.json out.jpg   (or one json for a single AFTER panel)
import sys, json
from PIL import Image, ImageDraw, ImageFont
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
X0,X1,Z0,Z1=640,1880,100,1320
S=0.62
PW,PH=int((X1-X0)*S),int((Z1-Z0)*S)
TOP,BOT,GAP=44,130,30
args=sys.argv[1:]
outp=args[-1]; jsons=args[:-1]
img=Image.new('RGB',(PW*len(jsons)+GAP*(len(jsons)-1),TOP+PH+BOT),(22,23,28)); D=ImageDraw.Draw(img)
def panel(path, ox, after):
  d=json.load(open(path))
  pim=Image.new('RGB',(PW,PH),(14,14,18)); dr=ImageDraw.Draw(pim)
  P=lambda x,z:((x-X0)*S,(z-Z0)*S)
  def R(x0,z0,x1,z1,**k): dr.rectangle([*P(x0,z0),*P(x1,z1)],**k)
  for x,z,y in d['open']:
    c=(60,62,72) if y<6 else ((96,104,120) if y>=20 else (80,86,100))
    R(x-10,z-10,x+10,z+10,fill=c)
  roofs=[]
  for p in sorted(d['prims'],key=lambda p:p.get('y1',0)):
    x0,x1,z0,z1=p['x']-p['w']/2,p['x']+p['w']/2,p['z']-p['d']/2,p['z']+p['d']/2
    m,g=p['mat'],p.get('group','') or ''
    if m=='sidewalk': continue
    if m=='water': R(x0,z0,x1,z1,fill=(36,70,130)); continue
    if p['kind']=='ramp': R(x0,z0,x1,z1,fill=(200,140,70)); continue
    if m=='tree': R(x0-6,z0-6,x1+6,z1+6,fill=(70,140,80)); continue
    if m=='pole': R(x0-3,z0-3,x1+3,z1+3,fill=(160,160,170)); continue
    if g=='radioTower': R(x0,z0,x1,z1,fill=(220,60,50)); continue
    if g=='chuoCore':
      if p['y0']<50: R(x0,z0,x1,z1,fill=(240,244,255))
      else: R(x0,z0,x1,z1,outline=(240,244,255),width=1)
      continue
    if g=='chuoHall':
      if p['y0']>=150: roofs.append((x0,z0,x1,z1)); continue
      R(x0,z0,x1,z1,fill=(150,156,168) if p['y1']>100 else (110,190,150)); continue
    if g=='chuoRing':
      if p['y0']>=150: R(x0,z0,x1,z1,outline=(240,244,255),width=2); continue
      R(x0,z0,x1,z1,fill=(196,200,208)); continue
    if g=='chuoBack': R(x0,z0,x1,z1,fill=(120,190,230)); continue
    if g=='chuoData': R(x0,z0,x1,z1,fill=(90,230,170) if p['w']<40 else (80,84,92)); continue
    if g=='chuoAnnex': R(x0,z0,x1,z1,fill=(120,124,134)); continue
    if g=='chuoPylon': R(x0-3,z0-3,x1+3,z1+3,fill=(240,244,255)); continue
    if g=='chuoGear': R(x0,z0,x1,z1,fill=(110,190,150)); continue
    if g=='chuoTerrace': R(x0,z0,x1,z1,outline=(230,200,120),width=2); continue
    if p.get('y1',0)<=6: continue
    if p['y0']>=50: R(x0,z0,x1,z1,outline=(200,196,180),width=2); continue
    R(x0,z0,x1,z1,fill=(150,140,120))
  for b in roofs: R(*b,outline=(200,210,230),width=1)
  for l in d.get('lights',[]):
    import math
    hx,hz=l['x']+math.cos(l['ang'])*22,l['z']+math.sin(l['ang'])*22
    px,pz=P(hx,hz); dr.ellipse([px-3,pz-3,px+3,pz+3],fill=(255,220,150))
  pt=d['point']; r=170*S; px,pz=P(pt['x'],pt['z']); dr.ellipse([px-r,pz-r,px+r,pz+r],outline=(255,255,255),width=2)
  dr.text((px-36,pz-8),'戦略拠点',fill=(255,255,255),font=F(14))
  t=d['tower']; r=t['r']*S; px,pz=P(t['x'],t['z']); dr.ellipse([px-r,pz-r,px+r,pz+r],outline=(255,110,110),width=2)
  if after:
    def route(pts,col,label,lx,lz,w=5):
      dr.line([P(x,z) for x,z in pts],fill=col,width=w,joint='curve')
      if label: dr.text(P(lx,lz),label,fill=col,font=F(17))
    route([(660,710),(1395,710)],(255,255,255),'A CORE AXIS',690,660,6)
    route([(880,360),(1690,360),(1690,870),(1640,970),(1540,1060),(880,1060),(880,360)],(110,240,160),'B RING ROUTE',900,330,4)
    route([(1520,180),(1520,450),(1545,505),(1415,505),(1415,605),(1479,650)],(150,200,255),'C CONTROL PASSAGE',1500,140,4)
    route([(1520,1240),(1520,970),(1545,915),(1415,915),(1415,815),(1479,770)],(150,200,255),'',0,0,4)
    for t,x,z in [('CONTROL CORE',1430,740),('CORE PLAZA',1100,680),('CONTROL RING',955,1010),('DATA WALL',1700,250),('SIGNAL PYLONS',1150,575),('N GATE',1110,440),('S GATE',1110,960),('W GATE',905,600),('北ホール',1450,400),('南ホール',1450,1010),('ANNEX',760,450),('ANNEX',1300,220)]:
      dr.text(P(x,z),t,fill=(255,230,120),font=F(14))
  for x in range(700,1900,200):
    dr.text(P(x,Z0+4),str(x),fill=(140,140,150),font=F(11))
  for z in range(200,1320,200):
    dr.text(P(X0+4,z),str(z),fill=(140,140,150),font=F(11))
  img.paste(pim,(ox,TOP))
  D.text((ox+8,8),('AFTER（MAP REFORGE parallel F：中央 CONTROL CORE）' if after else 'BEFORE（map-reforge-parallel-integrated 897dc77）'),fill=(240,240,240),font=F(20))
for i,j in enumerate(jsons): panel(j,i*(PW+GAP),after=(i==len(jsons)-1 and (len(jsons)>1 or 'after' in j)))
legend=['灰: 戦略拠点から歩いて行ける地面（実測の塗りつぶし）  白い円: 戦略拠点（半径170）  赤い円: 管制塔の範囲（半径80）  黄点: 夜の照明',
        '白: CONTROL CORE と SIGNAL PYLONS  明灰: CONTROL RING（白枠はゲートの梁）  灰: ANNEX  水色: CORE の背面ガラス  緑の帯: DATA WALL  緑の箱: 設備・ラック  金枠: 2段のテラス',
        'A 西から CORE へ直進（最速・見通し良好）  B 施設を一周（東は CORE の裏と線路の間）  C 北と南のホールを抜けて CORE の脇へ（ラックで視線が切れる）']
for i,t in enumerate(legend): D.text((10,TOP+PH+12+i*26),t,fill=(220,220,220),font=F(15))
img.save(outp,quality=88); print(img.size)
