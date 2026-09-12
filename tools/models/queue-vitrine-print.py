"""Fictional, unbranded paper cassette sleeve. Requires Pillow; no source art."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
im=Image.new('RGB',(256,256),(226,222,206));d=ImageDraw.Draw(im)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
d.rectangle((12,12,244,32),fill=(72,94,122))
d.text((128,76),'VIDEO',anchor='mm',font=ImageFont.truetype(font,38),fill=(64,83,112))
d.text((128,134),'120',anchor='mm',font=ImageFont.truetype(font,54),fill=(64,83,112))
d.text((128,190),'BLANK CASSETTE',anchor='mm',font=ImageFont.truetype(font,18),fill=(64,83,112))
for x in range(40,217,4):d.line((x,216,x,234),fill=(64,83,112),width=1 if x%3 else 2)
im.save(Path(__file__).with_name('queue-vitrine-print.png'))
