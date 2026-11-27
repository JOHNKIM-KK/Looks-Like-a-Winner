"""Assemble raw frames into sprite sheets (run with a Python that has Pillow + numpy, not Blender's)."""
import os, json
import numpy as np
from PIL import Image

MAX_W = 4096
PAD = 14  # empty pixels kept around the union of all frames

def load(path):
    return np.asarray(Image.open(path).convert('RGBA'))

def build_sheet(color_dir, mask_dir, n, out_color, out_mask, anchor_px, per_frame_anchor_px=None,
                alpha_cut=8, margin=PAD, quality=85, mask_ok=True):
    """Crop all frames to the union bbox (anchor_px = target in canvas px), write color(+mask) webp.
    Returns dict(frame_w, frame_h, anchor, per_frame, plate_per_frame)."""
    cols = [load(f'{color_dir}/f{i:03d}.png') for i in range(n)]
    masks = [load(f'{mask_dir}/f{i:03d}.png') for i in range(n)] if mask_dir else None
    al = np.stack([c[..., 3] for c in cols]).max(0) > alpha_cut
    ys, xs = np.where(al)
    H, W = al.shape
    if xs.min() == 0 or ys.min() == 0 or xs.max() == W - 1 or ys.max() == H - 1:
        raise SystemExit('figure touches the render canvas edge: enlarge the canvas')
    x0, x1 = max(0, xs.min() - margin), min(W, xs.max() + 1 + margin)
    y0, y1 = max(0, ys.min() - margin), min(H, ys.max() + 1 + margin)
    if (x1 - x0) * n > MAX_W:  # shave the margin before giving up
        x0, x1 = xs.min(), xs.max() + 1
    fw, fh = x1 - x0, y1 - y0
    if fw * n > MAX_W: raise SystemExit(f'sheet {fw}x{n} exceeds {MAX_W}px')
    sheet = np.zeros((fh, fw * n, 4), np.uint8); msheet = np.zeros((fh, fw * n, 4), np.uint8)
    plates = []
    for i in range(n):
        c = cols[i][y0:y1, x0:x1].copy()
        c[c[..., 3] <= alpha_cut] = 0
        sheet[:, i * fw:(i + 1) * fw] = c
        if masks:
            m = masks[i][y0:y1, x0:x1]
            hit = (m[..., 3] > 127)
            mm = np.zeros((fh, fw, 4), np.uint8)
            for ch in range(3): mm[..., ch] = np.where(hit & (m[..., ch] > 127), 255, 0)
            mm[..., 3] = 255
            msheet[:, i * fw:(i + 1) * fw] = mm
            b = (mm[..., 2] > 127) & (mm[..., 0] < 128)
            if b.any():
                yy, xx = np.where(b); plates.append(dict(cx=round(float(xx.mean()) + .5, 2), cy=round(float(yy.mean()) + .5, 2), h=round(float(yy.max() - yy.min() + 1), 2)))
            else: plates.append(None)
    Image.fromarray(sheet, 'RGBA').save(out_color, 'WEBP', quality=quality, method=6, exact=True)
    if masks: Image.fromarray(msheet, 'RGBA').convert('RGB').save(out_mask, 'WEBP', lossless=True, method=6)
    ax, ay = anchor_px[0] - x0, anchor_px[1] - y0
    out = dict(frame_w=int(fw), frame_h=int(fh), anchor=[round(ax, 2), round(ay, 2)], crop_origin=[int(x0), int(y0)])
    if per_frame_anchor_px is not None:
        out['per_frame_anchor'] = [[round(p[0] - x0, 2), round(p[1] - y0, 2)] for p in per_frame_anchor_px]
    if masks: out['plate_per_frame'] = plates
    return out
