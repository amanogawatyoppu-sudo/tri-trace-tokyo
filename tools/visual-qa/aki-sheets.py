from PIL import Image, ImageDraw, ImageFont
import json
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
F=lambda s: ImageFont.truetype(FONT,s)
import os
A=os.environ.get('AKI','/tmp/claude-0/aki/')
def tile(path,w=620):
    im=Image.open(path).crop((180,69,1170,768)); h=int(im.height*w/im.width); return im.resize((w,h))
def sheet(out,title,rows,w=620):
    # rows: [(label,[(caption,path),...]),...]
    ncol=max(len(r[1]) for r in rows); th=int(699*w/990)
    W=Image.new('RGB',(150+ncol*(w+8),60+len(rows)*(th+34)),(20,21,26)); d=ImageDraw.Draw(W)
    d.text((12,14),title,fill=(240,240,240),font=F(24))
    for i,(lab,cells) in enumerate(rows):
        y=60+i*(th+34)
        d.text((12,y+th//2-10),lab,fill=(255,230,120),font=F(20))
        for j,(cap,p) in enumerate(cells):
            x=150+j*(w+8)
            if p: W.paste(tile(p,w),(x,y+26))
            d.text((x,y+2),cap,fill=(220,220,220),font=F(17))
    W.save(A+'out/'+out,quality=86); print(out,W.size)
f=lambda n,t: A+'final/%s-%s.png'%(n,t)
b=lambda n,t: A+'before/%s-%s.png'%(n,t)
T=[('昼','day'),('夕方','sunset'),('夜','night')]
sheet('main-street.jpg','MAIN ELECTRIC STREET（大通りを南から北へ。正面に GRID GATE と CIRCUIT ARCADE）',
  [('BEFORE',[(c,b('street',t)) for c,t in T]),('AFTER',[(c,f('street',t)) for c,t in T]),('AFTER\n歩道橋の上',[(c,f('gate',t)) for c,t in T])])
sheet('component-alley.jpg','COMPONENT ALLEY（部品店の路地）',
  [('BEFORE',[('背骨の路地 → 南（昼）',b('alley-spine','day')),('南西の路地 → 北（昼）',b('alley-sw','day')),('P1 搬入口 → 大通り（昼）',b('alley-passage','day'))]),
   ('AFTER 昼',[('背骨の路地 → 南',f('alley-spine','day')),('南西の路地 → 北',f('alley-sw','day')),('P1 搬入口 → 大通り',f('alley-passage','day'))]),
   ('AFTER 夜',[('',f('alley-spine','night')),('',f('alley-sw','night')),('',f('alley-passage','night'))])])
sheet('service-cut.jpg','SERVICE CUT（高架沿いの裏通路と R2 搬入口）',
  [('BEFORE',[('裏通路 → 南（昼）',b('service','day')),('R2 搬入口 → 西（昼）',b('service-passage','day')),('',None)]),
   ('裏通路',[(c,f('service',t)) for c,t in T]),('R2 搬入口',[(c,f('service-passage',t)) for c,t in T])])
sheet('landmarks.jpg','ランドマーク（左: 昼、右: 夜）',
  [('GRID\nTOWER',[('大通りから北東（少し引いたカメラ）',f('tower-street','day')),('',f('tower-street','night')),('塔の広場から東',f('tower-square','day')),('',f('tower-square','night'))]),
   ('CIRCUIT\nARCADE',[('南口（路地から北）',f('arcade-south','day')),('',f('arcade-south','night')),('東口から中へ',f('arcade-in','day')),('',f('arcade-in','night'))]),
   ('DATA\nJUNCTION',[('部品店の小道から南',f('junction','day')),('',f('junction','night')),('川沿いから東',f('junction-east','day')),('',f('junction-east','night'))])],w=470)
sheet('before-after.jpg','BEFORE / AFTER（同じ地点・同じ向き・昼）',
  [('BEFORE',[(n,b(k,'day')) for n,k in [('大通り','street'),('路地','alley-spine'),('裏通路','service'),('塔の広場','tower-square'),('DATA JUNCTION','junction')]]),
   ('AFTER',[(n,f(k,'day')) for n,k in [('大通り','street'),('路地','alley-spine'),('裏通路','service'),('塔の広場','tower-square'),('DATA JUNCTION','junction')]])],w=420)
log=json.load(open(A+'run/log.txt'))['log']
names=['拠点の南','裏通路を抜けて川沿い','部品店の小道 → LOCK YARD','GRID GATE の上（高さ80）','西の路地','川沿い → 南東の路地','大通りを北へ','CIRCUIT ARCADE の中','P1 搬入口 → 大通り','川沿いの角 → DATA JUNCTION','R2 搬入口（裏通路 → LOCK YARD）','塔の広場へ']
cells=[('%d. %.1f秒 %s'%(i+1,l['t'],names[i]),A+'run/run-%02d.png'%i) for i,l in enumerate(log)]
sheet('run-30s.jpg','通常カメラの30秒走行（夕方、12枚、実際の移動・ゲーム内時間で等間隔）',[('',cells[0:4]),('',cells[4:8]),('',cells[8:12])],w=470)
