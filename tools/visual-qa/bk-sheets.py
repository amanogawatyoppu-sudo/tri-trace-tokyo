# Review sheets for 文京 QUIET SLOPES from shg-shots.cjs / shg-run30.cjs captures (BK=capture dir).
from PIL import Image, ImageDraw, ImageFont
import json, os
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
A=os.environ.get('BK','/tmp/claude-0/bk/')
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
f=lambda n,t: A+'after/after-%s-%s.png'%(n,t)
b=lambda n,t: A+'before/before-%s-%s.png'%(n,t)
T=[('昼','day'),('夕方','sunset'),('夜','night')]
def three(out,title,key,extra=None):
    rows=[('BEFORE',[(c,b(key,t)) for c,t in T]),('AFTER',[(c,f(key,t)) for c,t in T])]
    if extra: rows.append((extra[0],[(c,f(extra[1],t)) for c,t in T]))
    sheet(out,title,rows)
three('1-ridge-road.jpg','A. RIDGE ROAD（台地の上 y104、北端から南へ。右の柵越しに下の LOW ROAD が見える）','ridge')
three('2-slope-lane.jpg','B. SLOPE LANE（上: 上坂 KAMI-ZAKA を東へ上る / 下段: LOW ROAD から双子坂と台地の崖を見上げる）','slope',('AFTER\n双子坂','twin'))
three('3-wall-path.jpg','C. WALL PATH（石垣と塀・生垣の間の路地、北から南へ）','wall')
three('4-slope-gate.jpg','SLOPE GATE（春日通り側の坂下から南へ。門柱の先で坂を上って RIDGE ROAD へ）','gate')
three('5-ridge-terrace.jpg','RIDGE TERRACE（台地の南端のテラス。ベンチと柵の先は谷側の家並み、柵の切れ目から石段で下りる）','terrace')
three('6-stone-bend.jpg','STONE BEND（曲り坂の坂下から東へ。角の踊り場で北に折れて台地へ）','bend',('AFTER\nQUIET COURT','court'))
L=[('RIDGE ROAD','ridge'),('SLOPE LANE','slope'),('WALL PATH','wall'),('SLOPE GATE','gate'),('RIDGE TERRACE','terrace'),('STONE BEND','bend')]
sheet('7-before-after.jpg','BEFORE / AFTER（同じ地点・同じ向き・昼）',
  [('BEFORE',[(n,b(k,'day')) for n,k in L]),('AFTER',[(n,f(k,'day')) for n,k in L])],w=420)
log=json.load(open(A+'run/log.txt'))['log']
cells=[('%d. %.1f秒'%(i+1,l['t']),A+'run/run-%02d.png'%i) for i,l in enumerate(log)]
sheet('8-run-30s.jpg','通常カメラの30秒走行（夕方、12枚、実際のキー操作・ゲーム内時間で等間隔）',[('',cells[0:4]),('',cells[4:8]),('',cells[8:12])],w=470)
