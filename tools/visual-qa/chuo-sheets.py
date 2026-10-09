# Review sheets for 中央 CONTROL CORE from shg-shots.cjs (tags before / after) and chuo-run30.cjs captures.
# CHUO=/tmp/claude-0/chuo/ OUT=... python3 tools/visual-qa/chuo-sheets.py
from PIL import Image, ImageDraw, ImageFont
import json, os
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
A=os.environ.get('CHUO','/tmp/claude-0/chuo/')
OUT=os.environ.get('OUT',A+'out/'); os.makedirs(OUT,exist_ok=True)
def tile(path,w=620):
    im=Image.open(path).crop((90,36,1270,768)); h=int(im.height*w/im.width); return im.resize((w,h))
def sheet(out,title,rows,w=620):
    ncol=max(len(r[1]) for r in rows); th=int(732*w/1180)
    W=Image.new('RGB',(150+ncol*(w+8),60+len(rows)*(th+34)),(20,21,26)); d=ImageDraw.Draw(W)
    d.text((12,14),title,fill=(240,240,240),font=F(24))
    for i,(lab,cells) in enumerate(rows):
        y=60+i*(th+34)
        d.text((12,y+th//2-10),lab,fill=(255,230,120),font=F(20))
        for j,(cap,p) in enumerate(cells):
            x=150+j*(w+8)
            if p: W.paste(tile(p,w),(x,y+26))
            d.text((x,y+2),cap,fill=(220,220,220),font=F(17))
    W.save(OUT+out,quality=86); print(out,W.size)
f=lambda n,t: A+'final/after-%s-%s.png'%(n,t)
b=lambda n,t: A+'final/before-%s-%s.png'%(n,t)
T=[('昼','day'),('夕方','sunset'),('夜','night')]
def three(out,title,key):
    sheet(out,title,[('BEFORE',[(c,b(key,t)) for c,t in T]),('AFTER',[(c,f(key,t)) for c,t in T])])
three('1-core-axis.jpg','A. CORE AXIS（WEST GATE の内側から東へ。一直線の先に CONTROL CORE）','axis')
three('2-ring-route.jpg','B. RING ROUTE（北側の外周路を西から東へ。左が ANNEX、右が CONTROL RING）','ring')
three('3-control-passage.jpg','C. CONTROL PASSAGE（北ホールの中、ラックの間から出口とコアの方へ。右がラック、正面が柱）','passage')
three('4-control-core.jpg','CONTROL CORE（コアの西側、管制塔の範囲の中から）','core')
three('5-core-plaza.jpg','CORE PLAZA（西寄りから南東へ。SIGNAL PYLONS・端末・2段のテラス）','plaza')
three('6-control-ring.jpg','CONTROL RING（北の外周路から NORTH GATE を通して広場へ）','controlring')
three('7-data-wall.jpg','DATA WALL（コアの裏の外周路を南へ。右が DATA WALL、左がコアの背面ガラス）','datawall')
L=[('AXIS','axis'),('RING','ring'),('PASSAGE','passage'),('CORE','core'),('PLAZA','plaza'),('RING 北門','controlring'),('DATA WALL','datawall')]
sheet('8-before-after.jpg','BEFORE / AFTER（同じ地点・同じ向き・昼）',
  [('BEFORE',[(n,b(k,'day')) for n,k in L]),('AFTER',[(n,f(k,'day')) for n,k in L])],w=380)
log=json.load(open(A+'run/log.json'))['log']
names=['A. CORE AXIS の西端','C. 北ホール（ラックの間）','B. コアの裏（DATA WALL 沿い）','B. 南側の外周路を西へ','NORTH GATE から広場へ','B. 西側の外周路を北へ','A. CORE AXIS をダッシュ','C. 南ホール（ラックの間）','B. 南側の外周路','A. CORE の前','C. 北ホールを抜けて外周へ','B. 北側の外周路を西へ']
cells=[('%d. %.1f秒 %s'%(i+1,l['t'],names[i]),A+'run/run-%02d.png'%i) for i,l in enumerate(log)]
sheet('9-run-30s.jpg','通常カメラの30秒走行（夕方、12枚、実際のキー操作・ゲーム内時間で等間隔、ダッシュあり）',[('',cells[0:4]),('',cells[4:8]),('',cells[8:12])],w=470)
