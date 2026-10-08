# Ueno review sheets from aki-spots.cjs / aki-run30.cjs shots: UENO=/dir/ python3 ueno-sheets.py
# (before/<spot>-<time>.png, final/<spot>-<time>.png, run/run-NN.png + run/log.txt; writes out/*.jpg)
from PIL import Image, ImageDraw, ImageFont
import json, os
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
A=os.environ.get('UENO','/tmp/claude-0/ueno/')
def tile(path,w=620):
    im=Image.open(path).crop((180,69,1170,768)); h=int(im.height*w/im.width); return im.resize((w,h))
def sheet(out,title,rows,w=620):
    ncol=max(len(r[1]) for r in rows); th=int(699*w/990)
    W=Image.new('RGB',(150+ncol*(w+8),60+len(rows)*(th+34)),(20,21,26)); d=ImageDraw.Draw(W)
    d.text((12,14),title,fill=(240,240,240),font=F(24))
    for i,(lab,cells) in enumerate(rows):
        y=60+i*(th+34)
        d.multiline_text((12,y+th//2-10),lab,fill=(255,230,120),font=F(20))
        for j,(cap,p) in enumerate(cells):
            x=150+j*(w+8)
            if p: W.paste(tile(p,w),(x,y+26))
            d.text((x,y+2),cap,fill=(220,220,220),font=F(17))
    W.save(A+'out/'+out,quality=86); print(out,W.size)
f=lambda n,t: A+'final/%s-%s.png'%(n,t)
b=lambda n,t: A+'before/%s-%s.png'%(n,t)
T=[('昼','day'),('夕方','sunset'),('夜','night')]
sheet('routes.jpg','3つのルート（AFTER、通常カメラ）',
  [('A\nGRAND\nPROMENADE',[(c+'  広場の西から大通りを北へ',f('promenade',t)) if i==0 else (c,f('promenade',t)) for i,(c,t) in enumerate(T)]),
   ('B\nGROVE\nPATH',[(c+'  木立の道を北へ（藤棚・石壁）',f('grove',t)) if i==0 else (c,f('grove',t)) for i,(c,t) in enumerate(T)]),
   ('C\nTERRACE\nROUTE',[(c+'  CULTURE GATE から石段へ',f('terrace',t)) if i==0 else (c,f('terrace',t)) for i,(c,t) in enumerate(T)])])
sheet('landmarks.jpg','ランドマーク（AFTER、通常カメラ）',
  [('STONE\nAXIS',[(c+'  踊り場から上の段',f('axis',t)) if i==0 else (c,f('axis',t)) for i,(c,t) in enumerate(T)]),
   ('GREEN\nTERRACE',[(c+'  テラスから広場と門を見下ろす',f('gterrace',t)) if i==0 else (c,f('gterrace',t)) for i,(c,t) in enumerate(T)]),
   ('CANOPY\nWALK',[(c+'  北の崖下の並木道を東へ',f('canopy',t)) if i==0 else (c,f('canopy',t)) for i,(c,t) in enumerate(T)])])
sheet('high-ground.jpg','高台から見る・坂の頂上（AFTER）',
  [('テラスの\n西端',[(c+'  広場・池・大通りの入口を見下ろす',f('overlook',t)) if i==0 else (c,f('overlook',t)) for i,(c,t) in enumerate(T)]),
   ('WEST RAMP\nの頂上',[(c+'  坂の上から大通りへ（視線が切れる）',f('crest',t)) if i==0 else (c,f('crest',t)) for i,(c,t) in enumerate(T)])])
K=[('大通り','promenade'),('木立','grove'),('石段の下','terrace'),('並木道','canopy'),('テラス西端','overlook')]
sheet('before-after.jpg','BEFORE / AFTER（同じ地点・同じ向き。BEFORE は map-reforge-base bbe30ec）',
  [('BEFORE\n昼',[(n,b(k,'day')) for n,k in K]),('AFTER\n昼',[(n,f(k,'day')) for n,k in K]),
   ('BEFORE\n夜',[(n,b(k,'night')) for n,k in K]),('AFTER\n夜',[(n,f(k,'night')) for n,k in K])],w=420)
log=json.load(open(A+'run/log.txt'))['log']
names=['広場から石段の下へ','STONE AXIS を登りきって GREEN TERRACE','台地を横切り WEST RAMP の上','坂を下りて大通り','生垣の切れ目から木立へ、藤棚の横','切れ目から大通り → CANOPY WALK','並木道を東へ','東の芝生を南へ','CULTURE GATE の内側を西へ','広場から池沿いの腕へ','木立の南端 → 切れ目 → 大通り','大通りを北へ']
cells=[('%d. %.1f秒 %s'%(i+1,l['t'],names[i]),A+'run/run-%02d.png'%i) for i,l in enumerate(log)]
sheet('run-30s.jpg','通常カメラの30秒走行（夕方、12枚、実際のキー操作・ゲーム内時間で等間隔）',[('',cells[0:4]),('',cells[4:8]),('',cells[8:12])],w=470)
