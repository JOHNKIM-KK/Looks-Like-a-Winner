"""Contact sheet: python contact.py OUT.png sheet1.webp:frame_w:n [sheet2...]  (one row per sheet, composited on grey-green)"""
import sys
from PIL import Image
rows = []
for a in sys.argv[2:]:
    path, fw, n = a.split(':'); fw, n = int(fw), int(n)
    im = Image.open(path).convert('RGBA'); rows.append([im.crop((i * fw, 0, (i + 1) * fw, im.height)) for i in range(n)])
cell_w = max(f.width for r in rows for f in r); cell_h = max(f.height for r in rows for f in r)
W = max(len(r) for r in rows)
out = Image.new('RGBA', (cell_w * W, cell_h * len(rows)), (118, 150, 92, 255))
for y, r in enumerate(rows):
    for x, f in enumerate(r): out.alpha_composite(f, (x * cell_w + (cell_w - f.width) // 2, y * cell_h + (cell_h - f.height)))
out.convert('RGB').save(sys.argv[1])
