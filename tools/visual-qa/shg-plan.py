# BEFORE / AFTER plan of Shinagawa from shg-plan.qa.ts dumps (stacked: wide district).
import os, json
from PIL import Image, ImageDraw, ImageFont
D0=os.environ.get('SHG','/tmp/claude-0/shg/')
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
X0,X1,Z0,Z1=-1660,720,3920,5080
S=0.62
PW,PH=int((X1-X0)*S),int((Z1-Z0)*S)
TOP,BOT,GAP=40,120,50
img=Image.new('RGB',(PW,TOP+PH*2+GAP+BOT),(22,23,28)); D=ImageDraw.Draw(img)
def panel(name, oy, after):
  d=json.load(open(D0+'plan/%s.json'%name))
  pim=Image.new('RGB',(PW,PH),(14,14,18)); dr=ImageDraw.Draw(pim)
  P=lambda x,z:((x-X0)*S,(z-Z0)*S)
  def R(x0,z0,x1,z1,**k): dr.rectangle([*P(x0,z0),*P(x1,z1)],**k)
  for x,z,y in d['open']:
    c=(58,60,70) if y<10 else ((70,150,170) if y>=140 else (110,100,70))
    R(x-10,z-10,x+10,z+10,fill=c)
  for s in d['segs']:
    R(s['x']-s['w']/2+2,s['z']-s['d']/2,s['x']+s['w']/2-2,s['z']+s['d']/2,outline=(90,92,104))
  deck=[]
  for p in sorted(d['prims'],key=lambda p:p.get('y1',0)):
    x0,x1,z0,z1=p['x']-p['w']/2,p['x']+p['w']/2,p['z']-p['d']/2,p['z']+p['d']/2
    m,g=p['mat'],p.get('group','')
    if m=='sidewalk': continue
    if p['kind']=='ramp': R(x0,z0,x1,z1,fill=(230,140,50)); continue
    if m=='pole': R(x0-3,z0-3,x1+3,z1+3,fill=(160,160,170)); continue
    if m=='tree': R(x0,z0,x1,z1,fill=(70,140,80)); continue
    if m=='vending': R(x0,z0,x1,z1,fill=(220,60,80)); continue
    if g=='shgDeck':
      if p['y0']<100: R(x0,z0,x1,z1,fill=(160,160,170))
      elif p['w']>60 and p['d']>60: deck.append((x0,z0,x1,z1))
      continue
    if g=='shgArch':
      if p['y0']<50: R(x0,z0,x1,z1,fill=(240,240,250))
      else: R(x0,z0,x1,z1,outline=(240,240,250),width=2)
      continue
    if g=='shgCanopy':
      if p['y0']<50: R(x0,z0,x1,z1,fill=(200,200,210))
      continue
    if g=='shgForum': R(x0,z0,x1,z1,fill=(90,170,230)); continue
    if g=='shgProp': R(x0,z0,x1,z1,fill=(120,124,136)); continue
    if p.get('y1',0)<=6: continue
    if p['y0']>=50: R(x0,z0,x1,z1,outline=(200,196,180),width=2); continue
    R(x0,z0,x1,z1,fill=(150,146,132) if m!='glass' else (130,150,170))
  for b in deck: R(*b,outline=(70,230,240),width=3)
  pt=d['point']; r=150*S; px,pz=P(pt['x'],pt['z']); dr.ellipse([px-r,pz-r,px+r,pz+r],outline=(255,255,255),width=3)
  dr.text((px-40,pz-8),'戦略拠点',fill=(255,255,255),font=F(15))
  if after:
    def route(pts,col,label,lx,lz):
      dr.line([P(x,z) for x,z in pts],fill=col,width=5,joint='curve')
      dr.text(P(lx,lz),label,fill=col,font=F(18))
    route([(-1630,4480),(-200,4480),(100,4451)],(120,110,255),'A GATEWAY BOULEVARD',-1560,4430)
    route([(-1580,4262),(-440,4262),(-160,4262)],(70,255,200),'B TRANSIT DECK（高さ150）',-1560,4300)
    route([(-1630,4950),(-1260,4950),(-1260,4640)],(255,70,100),'',0,0)
    route([(-1260,4850),(-910,4850),(-910,4640)],(255,70,100),'',0,0)
    route([(-910,4860),(-500,4860),(-300,4860)],(255,70,100),'C SERVICE CORRIDOR',-1180,4930)
    for t,x,z in [('GATEWAY ARCH',-600,4740),('GLASS FORUM',-1100,4000),('LIGHT PLATFORM',-140,4900),('大屋根',-330,4540),('駅舎',-70,4060),('西階段',-1600,3960),('FORUM 階段',-790,3960),('大階段',-400,4335)]:
      dr.text(P(x,z),t,fill=(255,230,120),font=F(15))
  img.paste(pim,(0,oy))
  D.text((8,oy-32),('AFTER（MAP REFORGE parallel C：品川 FUTURE GATEWAY）' if after else 'BEFORE（map-reforge-base bbe30ec）'),fill=(240,240,240),font=F(22))
panel('before',TOP,False); panel('after',TOP+PH+GAP,True)
legend=['灰: 戦略拠点から歩いて行ける地面（実測の塗りつぶし）  水色の枠: TRANSIT DECK（高さ150、下は歩ける）  橙: 階段  白: GATEWAY ARCH の脚（白枠は頭上の梁）',
        '茶/青灰: 建物  水色の箱: GLASS FORUM  灰の小箱: ベンチ・植栽・機器  緑: 樹木  薄灰: 大屋根の柱・デッキの脚  円: 半径150（戦略拠点）',
        'A 大通り（最速・よく見える）  B デッキ（安全だが出口が3つだけ）  C 裏通路（狭く視線が切れる、2本の抜け道で大通りへ戻れる）']
for i,t in enumerate(legend): D.text((10,TOP+PH*2+GAP+12+i*26),t,fill=(220,220,220),font=F(17))
img.save(D0+'plan.jpg',quality=88); print(img.size)
