"""python contact_json.py DIR/name.json OUT.png [mask]  -> every angle as a row (colour sheets, or masks)."""
import sys, json, os
from PIL import Image
j = json.load(open(sys.argv[1])); d = os.path.dirname(sys.argv[1]); kind = 'mask' if 'mask' in sys.argv[3:] else 'color'
rows = []
for s in j['sets'].values():
    for a in s['angles']:
        im = Image.open(os.path.join(d, a[kind])).convert('RGBA'); fw = a['frame_w']
        rows.append([im.crop((i * fw, 0, (i + 1) * fw, im.height)) for i in range(j['frames'])])
cw = max(f.width for r in rows for f in r); ch = max(f.height for r in rows for f in r)
out = Image.new('RGBA', (cw * max(len(r) for r in rows), ch * len(rows)), (118, 150, 92, 255) if kind == 'color' else (0, 0, 0, 255))
for y, r in enumerate(rows):
    for x, f in enumerate(r): out.alpha_composite(f, (x * cw + (cw - f.width) // 2, y * ch + ch - f.height))
out.convert('RGB').save(sys.argv[2])
