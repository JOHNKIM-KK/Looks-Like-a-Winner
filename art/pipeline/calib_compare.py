"""Compare rendered raw frames with a shipped sheet.
python calib_compare.py <set> <angle> <rawdir> [--out PNG]
Finds, per reference frame, the best raw frame index + pixel shift (FFT cross-correlation of alpha silhouettes),
then reports IoU, anchor offset and luminance difference."""
import sys, json, os
import numpy as np
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def load_ref(set_, ai):
    d = json.load(open(f'{ROOT}/public/horses/horses.json'))
    ang = d['sets'][set_]['angles'][ai]
    im = np.asarray(Image.open(f"{ROOT}/public/horses/{ang['color']}").convert('RGBA')).astype(np.float32)
    w = ang['frame_w']
    return [im[:, k * w:(k + 1) * w] for k in range(d['frames'])], ang

def iou_map(a, b):
    """a, b bool arrays. returns inter map over all shifts (shift of b relative to a), via FFT."""
    H, W = a.shape[0] + b.shape[0], a.shape[1] + b.shape[1]
    fa = np.fft.rfft2(a.astype(np.float32), (H, W)); fb = np.fft.rfft2(b[::-1, ::-1].astype(np.float32), (H, W))
    inter = np.fft.irfft2(fa * fb, (H, W)); inter = np.rint(inter)
    union = a.sum() + b.sum() - inter
    return inter / np.maximum(union, 1)

def lum(rgba):
    m = rgba[..., 3] > 128
    return float((0.2126 * rgba[..., 0] + 0.7152 * rgba[..., 1] + 0.0722 * rgba[..., 2])[m].mean()) if m.any() else 0.0

def best_match(ref, raw):
    A = ref[..., 3] > 128; B = raw[..., 3] > 128
    m = iou_map(A, B)
    y, x = np.unravel_index(np.argmax(m), m.shape)
    # shift: raw pixel (i,j) lands at ref (i + y - (B.shape[0]-1), j + x - (B.shape[1]-1))
    dy, dx = y - (B.shape[0] - 1), x - (B.shape[1] - 1)
    return float(m[y, x]), dx, dy

def composite(rgba, bg=(110, 150, 85)):
    out = np.zeros(rgba.shape[:2] + (3,), np.float32) + np.array(bg, np.float32)
    al = rgba[..., 3:4] / 255
    return (out * (1 - al) + rgba[..., :3] * al).astype(np.uint8)

def shifted(raw, dx, dy, shape):
    out = np.zeros(shape + (4,), np.float32)
    H, W = shape
    for_y0, for_x0 = max(0, dy), max(0, dx)
    sy0, sx0 = max(0, -dy), max(0, -dx)
    h = min(raw.shape[0] - sy0, H - for_y0); w = min(raw.shape[1] - sx0, W - for_x0)
    if h > 0 and w > 0: out[for_y0:for_y0 + h, for_x0:for_x0 + w] = raw[sy0:sy0 + h, sx0:sx0 + w]
    return out

if __name__ == '__main__':
    set_, ai, rawdir = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    outpng = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
    PAIR = '--pair' in sys.argv
    refs, ang = load_ref(set_, ai)
    meta = json.load(open(f'{rawdir}/meta.json'))
    raws = [np.asarray(Image.open(f'{rawdir}/{n}').convert('RGBA')).astype(np.float32) for n in sorted(os.listdir(rawdir)) if n.endswith('.png')]
    cx, cy = meta['target']; ax, ay = ang['anchor']
    rows = []; tiles = []
    for k, ref in enumerate(refs):
        best = (*best_match(ref, raws[k]), k) if PAIR else max(((*best_match(ref, r), j) for j, r in enumerate(raws)), key=lambda t: t[0])
        i, dx, dy, j = best
        # ref anchor expressed in raw canvas minus raw target
        off = (ax - dx - cx, ay - dy - cy)
        sh = shifted(raws[j], dx, dy, ref.shape[:2])
        a = ref[..., 3] > 128; b = sh[..., 3] > 128
        l_ref, l_me = lum(ref), lum(sh)
        rows.append((k, j if PAIR else j / 2, i, off[0], off[1], l_ref, l_me))
        tiles.append(np.concatenate([composite(ref), composite(sh)], 0))
    print('k  rawframe  IoU  anchorOffset(px)  lumRef lumMine lumDiff%')
    for r in rows: print(f'{r[0]:2d} {r[1]:5.1f} {r[2]:.3f}  ({r[3]:6.1f},{r[4]:6.1f})  {r[5]:6.1f} {r[6]:6.1f} {100*(r[6]-r[5])/r[5]:+.1f}')
    ious = [r[2] for r in rows]; print('mean IoU %.3f min %.3f | median offset (%.1f,%.1f) | mean lum diff %+.1f%%' % (np.mean(ious), min(ious),
          np.median([r[3] for r in rows]), np.median([r[4] for r in rows]), np.mean([100*(r[6]-r[5])/r[5] for r in rows])))
    if outpng: Image.fromarray(np.concatenate(tiles, 1)).save(outpng)
