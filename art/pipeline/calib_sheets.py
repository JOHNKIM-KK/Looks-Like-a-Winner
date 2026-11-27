"""Compare assembled gallop sheets (make_horse.py gallop --out DIR) with the shipped ones.
python calib_sheets.py DIR   -> per camera: frame size/anchor deltas, colour IoU, mask-G IoU, luminance diff"""
import sys, json, os
import numpy as np
from PIL import Image
from calib_compare import ROOT, iou_map, lum, best_match
mine = json.load(open(f'{sys.argv[1]}/gallop.json')); ref = json.load(open(f'{ROOT}/public/horses/horses.json'))
allI = []; allL = []
for s in ('straight', 'corner'):
    for ra, ma in zip(ref['sets'][s]['angles'], mine['sets'].get(s, {}).get('angles', [])):
        ci = np.asarray(Image.open(f"{ROOT}/public/horses/{ra['color']}").convert('RGBA')).astype(float)
        cm = np.asarray(Image.open(f"{sys.argv[1]}/{ma['color']}").convert('RGBA')).astype(float)
        mi = np.asarray(Image.open(f"{ROOT}/public/horses/{ra['mask']}").convert('RGB'))
        mm = np.asarray(Image.open(f"{sys.argv[1]}/{ma['mask']}").convert('RGB'))
        ious = []; gi = []; ld = []
        for k in range(12):
            r = ci[:, k * ra['frame_w']:(k + 1) * ra['frame_w']]
            # align by anchors
            m = cm[:, k * ma['frame_w']:(k + 1) * ma['frame_w']]
            dx = round(ra['anchor'][0] - ma['anchor'][0]); dy = round(ra['anchor'][1] - ma['anchor'][1])
            H, W = r.shape[:2]; canvas = np.zeros((H, W, 4)); gcanvas = np.zeros((H, W), bool)
            mg = mm[:, k * ma['frame_w']:(k + 1) * ma['frame_w'], 1] > 127
            for (dst, src) in ((canvas, m), (gcanvas, mg)):
                y0, x0 = max(0, dy), max(0, dx); sy, sx = max(0, -dy), max(0, -dx)
                h = min(src.shape[0] - sy, H - y0); w = min(src.shape[1] - sx, W - x0)
                dst[y0:y0 + h, x0:x0 + w] = src[sy:sy + h, sx:sx + w]
            A = r[..., 3] > 128; B = canvas[..., 3] > 128
            ious.append((A & B).sum() / (A | B).sum())
            GA = mi[:, k * ra['frame_w']:(k + 1) * ra['frame_w'], 1] > 127
            gi.append((GA & gcanvas).sum() / max(1, (GA | gcanvas).sum()))
            ld.append(100 * (lum(canvas) - lum(r)) / lum(r))
        print(f"{s} a{ra['index']}: frame {ma['frame_w']}x{ma['frame_h']} vs {ra['frame_w']}x{ra['frame_h']}  anchor d=({ma['anchor'][0]-ra['anchor'][0]:+.1f},{ma['anchor'][1]-ra['anchor'][1]:+.1f})"
              f"  IoU {np.mean(ious):.3f} (min {min(ious):.3f})  clothIoU {np.mean(gi):.2f}  lum {np.mean(ld):+.1f}%")
        allI += ious; allL += ld
print(f'ALL mean IoU {np.mean(allI):.3f} min {min(allI):.3f}; mean |lum diff| {np.mean(np.abs(allL)):.1f}%')
