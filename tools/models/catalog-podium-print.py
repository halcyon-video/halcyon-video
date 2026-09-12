"""Original fictional catalog spread. Run before catalog-podium.py; Pillow/DejaVu."""
from PIL import Image, ImageDraw, ImageFont
import random
random.seed(200)
atlas=Image.new('RGB',(1536,1024))
sets=[['Amber Road','Autumn Crossing','Beyond the Harbor','Blue Lantern','City of Echoes','Distant Summer','Evening Train','First Snow','Golden Hour','Homeward Bound','Island Letters','Last Lighthouse','Midnight Garden'],
      ['Northern Lights','Ocean Passage','Open Window','Quiet Valley','River Journey','Silver Coast','Summer Letters','The Long Way Home','Tomorrow Again','Under the Stars','Valley Road','Winter Harbor','Yesterday Once More']]
for page,names in enumerate(sets):
 im=Image.new('RGB',(768,1024),(235,231,214));p=im.load()
 for y in range(1024):
  for x in range(768):
   d=random.choice([-2,-1,0,0,1,2]);p[x,y]=(235+d,231+d,214+d)
 d=ImageDraw.Draw(im)
 def f(size):
  suffix='-Bold' if size>=24 else ''
  return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+suffix+'.ttf',size)
 c=(82,84,81)  # ink ~.08 linear reflectance, rather than absolute black
 d.text((54,44),'VIDEO CATALOG',font=f(42),fill=c)
 d.text((54,104),'TITLE INDEX   /   '+('A — M' if page==0 else 'N — Z'),font=f(26),fill=c)
 d.line((54,150,714,150),fill=c,width=3)
 for i,title in enumerate(names):
  y=190+i*55;d.text((54,y),title,font=f(26),fill=c)
  d.text((630,y),str(101+(i+page*13)*7),font=f(26),fill=c)
  d.line((54,y+39,714,y+39),fill=(195,191,176))
 d.text((54,939),'Ask at the counter for availability.',font=f(20),fill=c)
 d.text((660,981),str(12+page),font=f(18),fill=c)
 atlas.paste(im,(page*768,0))
atlas.save(__file__.replace('-print.py','-print.png'))
