# Review sheets for 品川 FUTURE GATEWAY from shg-shots.cjs / shg-run30.cjs captures.
from PIL import Image, ImageDraw, ImageFont
import json, os
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
A=os.environ.get('SHG','/tmp/claude-0/shg/')
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
three('1-gateway-boulevard.jpg','A. GATEWAY BOULEVARD（西端から東へ。一直線の先に GATEWAY ARCH と駅前）','blvd')
three('2-transit-deck.jpg','B. TRANSIT DECK（高さ150のデッキの上から東へ。左下に大通りが並走）','deck')
three('3-service-corridor.jpg','C. SERVICE CORRIDOR（上: 西の区間から東へ / 下段: 中の区間から東へ）','corrW',('AFTER\n中の区間','corrM'))
sheet('4-gateway-arch.jpg','GATEWAY ARCH（上: 大通りから東へ、少し引いたカメラ / 下: 駅前広場から西へ振り返り）',
  [('BEFORE',[(c,b('arch',t)) for c,t in T]),('AFTER',[(c,f('arch',t)) for c,t in T]),('AFTER\n振り返り',[(c,f('archback',t)) for c,t in T])])
three('5-glass-forum.jpg','GLASS FORUM（デッキ下から北へ。ガラス越しに中が見え、まっすぐ通り抜けられる）','forum')
three('6-plaza.jpg','LIGHT PLATFORM（駅前広場、大屋根の下から東へ）','plaza')
three('7-service-cut.jpg','裏通路の抜け道（裏通路から北へ。正面が大通り）','cut')
L=[('大通り','blvd'),('デッキ','deck'),('ARCH','arch'),('FORUM','forum'),('広場','plaza'),('裏通路','corrM')]
sheet('8-before-after.jpg','BEFORE / AFTER（同じ地点・同じ向き・昼）',
  [('BEFORE',[(n,b(k,'day')) for n,k in L]),('AFTER',[(n,f(k,'day')) for n,k in L])],w=420)
log=json.load(open(A+'run/log.txt'))['log']
names=['裏通路の西端','裏通路から大通りへ出てダッシュ','LIGHT PLATFORM（駅前）','大階段でデッキへ','TRANSIT DECK を西へ','西階段を降りて北の歩道','GLASS FORUM を南へ通り抜け','切り通しから裏通路へ','裏通路を抜けて広場','大屋根の下 → 戦略拠点','大通りを西へ（ARCH をくぐる）','切り通しから裏通路へ戻る']
cells=[('%d. %.1f秒 %s'%(i+1,l['t'],names[i]),A+'run/run-%02d.png'%i) for i,l in enumerate(log)]
sheet('9-run-30s.jpg','通常カメラの30秒走行（夕方、12枚、実際のキー操作・ゲーム内時間で等間隔、ダッシュあり）',[('',cells[0:4]),('',cells[4:8]),('',cells[8:12])],w=470)
