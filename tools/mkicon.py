from PIL import Image, ImageDraw, ImageFont
import os
FONT = None
for w in ["W7","W6","W8","W5","W3"]:
    p = f"/System/Library/Fonts/ヒラギノ角ゴシック {w}.ttc"
    if os.path.exists(p): FONT = p; break
BG, FG = (20,18,15), (224,169,79)
out = os.path.expanduser("~/jp-shadowing/icons")
os.makedirs(out, exist_ok=True)

def make(sz):
    S = sz*4                       # 4x 超采样后缩小，边缘干净
    im = Image.new("RGB",(S,S),BG)
    d  = ImageDraw.Draw(im)
    # 背景微渐变
    for y in range(S):
        k = y/S
        d.line([(0,y),(S,y)], fill=(int(30-10*k),int(27-9*k),int(23-8*k)))
    # 主字
    f = ImageFont.truetype(FONT, int(S*0.52), index=0)
    bb = d.textbbox((0,0),"影",font=f)
    d.text(((S-bb[2]-bb[0])/2,(S-bb[3]-bb[1])/2 - S*0.045),"影",font=f,fill=FG)
    # 底部声波暗示
    y = int(S*0.795); bars=[0.30,0.62,1.0,0.62,0.30]
    bw, gap = int(S*0.030), int(S*0.030)
    tot = len(bars)*bw + (len(bars)-1)*gap; x = (S-tot)//2
    for b in bars:
        h = int(S*0.105*b)
        d.rounded_rectangle([x,y-h//2,x+bw,y+h//2], radius=bw//2, fill=FG)
        x += bw+gap
    return im.resize((sz,sz), Image.LANCZOS)

for s in (180,192,512):
    make(s).save(f"{out}/icon-{s}.png")
    print(f"  icon-{s}.png")
