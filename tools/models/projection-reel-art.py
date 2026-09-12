"""Compose the existing flat-store awning from authored alpha poses. python3 tools/models/projection-reel-art.py"""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageOps
ROOT=Path(__file__).resolve().parents[2]
# Regression gate: aligned empty-flange windows and spindle bore stay transparent.
front=Image.open(ROOT/'public/models/projection-reel/front.png')
assert front.mode=='RGBA'
assert front.getpixel((256,256))[3]==0
for k in range(5):
 a=(k+.5)*2*math.pi/5
 xy=(round(256+.37/1.62*512*math.cos(a)),round(256-.37/1.62*512*math.sin(a)))
 assert front.getpixel(xy)[3]==0, ('Occluded flange window',xy)
canvas=Image.new('RGBA',(1920,130),(0,0,0,0))
d=ImageDraw.Draw(canvas)
# Retain the existing long, low collage composition and quiet centre for live text.
for x,y,w in [(25,28,360),(385,76,385),(1040,25,375),(1505,78,360)]:
 d.rectangle((x,y,x+w,y+19),fill=(44,78,178,38))
 for sx in range(x+3,x+w-4,14):
  for sy in [y+2,y+15]:d.rectangle((sx,sy,sx+5,sy+2),fill=(83,120,218,65))
for pose,x,y,size,angle in [('three-quarter',12,-5,123,-18),('front',136,35,78,18),('stacked',265,-22,113,8),('side',445,38,88,-24),('three-quarter',655,-3,100,25),('front',931,38,94,15),('stacked',1170,-11,119,-15),('three-quarter',1454,14,123,18),('side',1640,-8,94,-20),('front',1800,33,79,-12)]:
 im=Image.open(ROOT/'public/models/projection-reel'/f'{pose}.png').convert('RGBA')
 im=im.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
 im.thumbnail((size,size),Image.Resampling.LANCZOS)
 # Blue duotone keeps the established fascia palette while alpha keeps holes open.
 tinted=ImageOps.colorize(ImageOps.grayscale(im),(8,17,49),(100,135,222)).convert('RGBA');tinted.putalpha(im.getchannel('A').point(lambda a:round(a*.74)))
 canvas.alpha_composite(tinted,(x,y))
canvas.save(ROOT/'src/assets/awning-projection-reel.png',optimize=True)
